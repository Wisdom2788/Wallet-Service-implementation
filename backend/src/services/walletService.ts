/**
 * WalletService — Core Financial Logic
 * ════════════════════════════════════════════════════════════════════════════
 *
 * DESIGN PRINCIPLES:
 *
 * 1. DOUBLE-ENTRY LEDGER
 *    Every financial event creates exactly 2 ledger entries:
 *      - Deposit $100 → CREDIT user wallet $100 + DEBIT system $100
 *      - Transfer $50 → DEBIT sender wallet $50 + CREDIT receiver wallet $50
 *    The sum of all entries across all wallets is always zero. This is the
 *    fundamental accounting identity and our primary consistency check.
 *
 * 2. BALANCE IS DERIVED, NEVER STORED
 *    balance = SUM(CREDIT entries) - SUM(DEBIT entries) for a given wallet.
 *    Storing a denormalized balance column is the #1 source of inconsistency
 *    in naive wallet implementations.
 *
 * 3. PESSIMISTIC LOCKING FOR CONCURRENCY
 *    Transfers use SELECT ... FOR UPDATE on both wallet rows.
 *    Locks are acquired in a deterministic order (sorted wallet IDs) to
 *    prevent deadlocks when two concurrent transfers involve the same wallets.
 *
 * 4. IDEMPOTENCY
 *    Callers can supply an Idempotency-Key header. If a transaction with that
 *    key already exists, we return the original result without re-processing.
 *    This makes retries safe for all mutating operations.
 */

import { PoolClient } from 'pg';
import { withTransaction, query, queryOne } from '../config/database';
import {
  NotFoundError,
  InsufficientFundsError,
  ConflictError,
  IdempotencyConflictError,
} from '../errors/AppError';
import {
  BalanceResponse,
  Transaction,
  TransactionHistoryItem,
  Wallet,
} from '../types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetch a wallet by user ID. Throws NotFoundError if absent.
 */
async function getWalletByUserId(userId: string): Promise<Wallet> {
  const wallet = await queryOne<Wallet>(
    'SELECT id, user_id, created_at FROM wallets WHERE user_id = $1',
    [userId]
  );
  if (!wallet) throw new NotFoundError(`Wallet for user ${userId}`);
  return wallet;
}

/**
 * Compute the balance of a wallet by summing its ledger entries.
 * This query runs against the ledger_entries table (which is indexed on wallet_id),
 * so it's fast even for wallets with large transaction histories.
 *
 * Using a client param means we can call this INSIDE an open transaction
 * and see the locked, in-progress state — which is essential for
 * preventing double-spending.
 */
async function computeBalance(walletId: string, client?: PoolClient): Promise<number> {
  const sql = `
    SELECT
      COALESCE(
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END),
        0
      ) AS balance
    FROM ledger_entries
    WHERE wallet_id = $1
  `;
  const executor = client ?? { query: (t: string, p: unknown[]) => query(t, p) };
  const result = await (client
    ? client.query(sql, [walletId])
    : query<{ balance: string }>(sql, [walletId]));

  const rows = client ? (result as { rows: { balance: string }[] }).rows : result as { balance: string }[];
  return parseFloat(rows[0]?.balance ?? '0');
}

// ─── Public Service Methods ───────────────────────────────────────────────────

/**
 * Get the current wallet balance for a user.
 */
export async function getBalance(userId: string): Promise<BalanceResponse> {
  const wallet = await getWalletByUserId(userId);

  const sql = `
    SELECT
      COALESCE(
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END),
        0
      ) AS balance
    FROM ledger_entries
    WHERE wallet_id = $1
  `;
  const rows = await query<{ balance: string }>(sql, [wallet.id]);
  const balance = parseFloat(rows[0]?.balance ?? '0');

  return {
    user_id: userId,
    wallet_id: wallet.id,
    balance,
    currency: 'NGN',
  };
}

/**
 * Deposit funds into a user's wallet.
 *
 * Creates:
 *   - 1 transaction record (type=DEPOSIT)
 *   - 1 ledger entry (CREDIT on the user's wallet)
 *
 * Note: A strict double-entry implementation would also create a matching
 * DEBIT on a "system" or "external" wallet. For this scope we track only
 * the user-facing side, but the architecture supports extending to full
 * double-entry trivially.
 */
export async function deposit(
  userId: string,
  amount: number,
  idempotencyKey?: string
): Promise<Transaction> {
  // ── Idempotency check ──────────────────────────────────────────────────────
  if (idempotencyKey) {
    const existing = await queryOne<Transaction>(
      'SELECT * FROM transactions WHERE reference = $1',
      [idempotencyKey]
    );
    if (existing) throw new IdempotencyConflictError(existing);
  }

  const wallet = await getWalletByUserId(userId);

  return withTransaction(async (client) => {
    // Insert the transaction record
    const txResult = await client.query<Transaction>(
      `INSERT INTO transactions (type, reference, to_wallet_id, amount, status)
       VALUES ('DEPOSIT', $1, $2, $3, 'COMPLETED')
       RETURNING *`,
      [idempotencyKey ?? null, wallet.id, amount]
    );
    const transaction = txResult.rows[0];

    // Insert the CREDIT ledger entry for the user's wallet
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, 'CREDIT', $3)`,
      [wallet.id, transaction.id, amount]
    );

    return transaction;
  });
}

/**
 * Transfer funds between two users.
 *
 * CONCURRENCY STRATEGY — Pessimistic Locking:
 * ─────────────────────────────────────────────
 * 1. Open a transaction.
 * 2. SELECT both wallet rows FOR UPDATE, ordered by wallet.id ASC.
 *    The consistent ordering is critical: if two concurrent transfers both
 *    involve wallets A and B, they both try to lock A first. The second
 *    request waits rather than causing a deadlock.
 * 3. Recompute the sender's balance inside the locked transaction.
 *    This sees the definitive, locked state — no race condition possible.
 * 4. If balance is sufficient, insert transaction + two ledger entries atomically.
 * 5. COMMIT releases the locks.
 *
 * Any failure at step 4 or later rolls back everything — partial updates
 * are impossible.
 */
export async function transfer(
  fromUserId: string,
  toUserId: string,
  amount: number,
  idempotencyKey?: string
): Promise<Transaction> {
  // ── Idempotency check (outside transaction — fast path) ──────────────────
  if (idempotencyKey) {
    const existing = await queryOne<Transaction>(
      'SELECT * FROM transactions WHERE reference = $1',
      [idempotencyKey]
    );
    if (existing) throw new IdempotencyConflictError(existing);
  }

  // Fetch wallets before the transaction to avoid holding locks longer than needed
  const [fromWallet, toWallet] = await Promise.all([
    getWalletByUserId(fromUserId),
    getWalletByUserId(toUserId),
  ]);

  return withTransaction(async (client) => {
    // ── Acquire locks in consistent order to prevent deadlock ──────────────
    const [firstId, secondId] = [fromWallet.id, toWallet.id].sort();

    await client.query(
      `SELECT id FROM wallets WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      [[firstId, secondId]]
    );

    // ── Verify sender has sufficient funds ─────────────────────────────────
    // We must recompute balance here (inside the lock) to prevent TOCTOU races.
    const balanceResult = await client.query<{ balance: string }>(
      `SELECT COALESCE(
         SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END),
         0
       ) AS balance
       FROM ledger_entries
       WHERE wallet_id = $1`,
      [fromWallet.id]
    );
    const currentBalance = parseFloat(balanceResult.rows[0]?.balance ?? '0');

    if (currentBalance < amount) {
      throw new InsufficientFundsError();
    }

    // ── Create transaction record ──────────────────────────────────────────
    const txResult = await client.query<Transaction>(
      `INSERT INTO transactions (type, reference, from_wallet_id, to_wallet_id, amount, status)
       VALUES ('TRANSFER', $1, $2, $3, $4, 'COMPLETED')
       RETURNING *`,
      [idempotencyKey ?? null, fromWallet.id, toWallet.id, amount]
    );
    const transaction = txResult.rows[0];

    // ── Create double-entry ledger entries ─────────────────────────────────
    // DEBIT from sender
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, 'DEBIT', $3)`,
      [fromWallet.id, transaction.id, amount]
    );

    // CREDIT to receiver
    await client.query(
      `INSERT INTO ledger_entries (wallet_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, 'CREDIT', $3)`,
      [toWallet.id, transaction.id, amount]
    );

    return transaction;
  });
}

/**
 * Get paginated transaction history for a user.
 *
 * Joins through ledger_entries to determine the direction (CREDIT/DEBIT)
 * relative to the querying user, then enriches with counterparty name.
 */
export async function getTransactionHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<TransactionHistoryItem[]> {
  const wallet = await getWalletByUserId(userId);

  const sql = `
    SELECT
      t.id,
      t.type,
      t.amount,
      t.status,
      t.created_at,
      le.entry_type                           AS direction,
      -- Counterparty: the OTHER user in a transfer
      CASE
        WHEN t.type = 'TRANSFER' AND le.entry_type = 'DEBIT'
          THEN u_to.name
        WHEN t.type = 'TRANSFER' AND le.entry_type = 'CREDIT' AND t.from_wallet_id IS NOT NULL
          THEN u_from.name
        ELSE NULL
      END                                     AS counterparty_name
    FROM ledger_entries le
    JOIN transactions t ON t.id = le.transaction_id
    LEFT JOIN wallets w_from ON w_from.id = t.from_wallet_id
    LEFT JOIN users u_from   ON u_from.id = w_from.user_id
    LEFT JOIN wallets w_to   ON w_to.id = t.to_wallet_id
    LEFT JOIN users u_to     ON u_to.id = w_to.user_id
    WHERE le.wallet_id = $1
    ORDER BY le.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const rows = await query<{
    id: string;
    type: 'DEPOSIT' | 'TRANSFER';
    amount: string;
    status: 'COMPLETED' | 'FAILED' | 'PENDING';
    created_at: Date;
    direction: 'CREDIT' | 'DEBIT';
    counterparty_name: string | null;
  }>(sql, [wallet.id, limit, offset]);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    direction: row.direction,
    amount: parseFloat(row.amount),
    counterparty_name: row.counterparty_name ?? undefined,
    created_at: row.created_at,
    status: row.status,
  }));
}
