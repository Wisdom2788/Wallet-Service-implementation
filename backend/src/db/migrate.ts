import { pool } from '../config/database';
import dotenv from 'dotenv';
dotenv.config();

const MIGRATION_SQL = `
  -- Enable UUID generation
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- ─── Users ───────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255)        NOT NULL,
    email        VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255)       NOT NULL,
    created_at   TIMESTAMPTZ         NOT NULL DEFAULT NOW()
  );

  -- ─── Wallets ─────────────────────────────────────────────────────────────────
  -- One wallet per user (enforced by UNIQUE constraint on user_id).
  -- We could support multi-wallet users in future by dropping this constraint.
  CREATE TABLE IF NOT EXISTS wallets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- ─── Transactions ─────────────────────────────────────────────────────────────
  -- A transaction is a financial event (deposit or transfer).
  -- 'reference' stores the caller-supplied idempotency key.
  -- amount uses NUMERIC to avoid floating-point precision issues.
  CREATE TABLE IF NOT EXISTS transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type           VARCHAR(20)         NOT NULL CHECK (type IN ('DEPOSIT', 'TRANSFER')),
    reference      VARCHAR(255) UNIQUE,          -- idempotency key (nullable for non-idempotent ops)
    from_wallet_id UUID REFERENCES wallets(id),  -- NULL for deposits
    to_wallet_id   UUID REFERENCES wallets(id),
    amount         NUMERIC(20, 2)      NOT NULL CHECK (amount > 0),
    status         VARCHAR(20)         NOT NULL DEFAULT 'COMPLETED'
                     CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    metadata       JSONB,                        -- extensible: store extra context
    created_at     TIMESTAMPTZ         NOT NULL DEFAULT NOW()
  );

  -- ─── Ledger Entries ───────────────────────────────────────────────────────────
  -- Each transaction produces exactly 2 ledger entries (double-entry).
  -- entry_type = CREDIT means money coming IN to the wallet.
  -- entry_type = DEBIT  means money going OUT of the wallet.
  CREATE TABLE IF NOT EXISTS ledger_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id      UUID        NOT NULL REFERENCES wallets(id),
    transaction_id UUID        NOT NULL REFERENCES transactions(id),
    entry_type     VARCHAR(10) NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT')),
    amount         NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
  );

  -- ─── Indexes ──────────────────────────────────────────────────────────────────
  -- These are critical for query performance at scale.
  
  -- Balance calculation hits ledger_entries by wallet_id constantly
  CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_id
    ON ledger_entries (wallet_id);

  -- Transaction history sorted by date
  CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_created
    ON ledger_entries (wallet_id, created_at DESC);

  -- Idempotency key lookups
  CREATE INDEX IF NOT EXISTS idx_transactions_reference
    ON transactions (reference) WHERE reference IS NOT NULL;

  -- Wallet lookup by user
  CREATE INDEX IF NOT EXISTS idx_wallets_user_id
    ON wallets (user_id);

  -- Users email lookup (login)
  CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running database migrations...');
    await client.query(MIGRATION_SQL);
    console.log('✅ Migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
