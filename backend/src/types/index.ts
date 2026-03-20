// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

export interface Wallet {
  id: string;
  user_id: string;
  created_at: Date;
}

export type TransactionType = 'DEPOSIT' | 'TRANSFER';
export type TransactionStatus = 'COMPLETED' | 'FAILED' | 'PENDING';
export type LedgerEntryType = 'CREDIT' | 'DEBIT';

export interface Transaction {
  id: string;
  type: TransactionType;
  reference: string | null;       // idempotency key
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  amount: string;                 // NUMERIC from pg comes back as string
  status: TransactionStatus;
  created_at: Date;
}

export interface LedgerEntry {
  id: string;
  wallet_id: string;
  transaction_id: string;
  entry_type: LedgerEntryType;
  amount: string;
  created_at: Date;
}

// ─── API Request/Response Types ───────────────────────────────────────────────

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface DepositRequest {
  user_id: string;
  amount: number;
}

export interface TransferRequest {
  from_user_id: string;
  to_user_id: string;
  amount: number;
}

export interface BalanceResponse {
  user_id: string;
  wallet_id: string;
  balance: number;
  currency: string;
}

export interface TransactionHistoryItem {
  id: string;
  type: TransactionType;
  direction: 'CREDIT' | 'DEBIT';   // relative to the queried user
  amount: number;
  counterparty_name?: string;
  created_at: Date;
  status: TransactionStatus;
}

export interface AuthPayload {
  userId: string;
  email: string;
  walletId: string;
}

// ─── Express augmentation ─────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
