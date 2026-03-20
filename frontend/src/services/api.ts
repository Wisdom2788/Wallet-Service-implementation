import axios, { AxiosError } from 'axios';


export const api = axios.create({
  baseURL: '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wallet_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});


api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wallet_token');
      localStorage.removeItem('wallet_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const newIdempotencyKey = (): string => crypto.randomUUID();


export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  wallet: Wallet;
  token: string;
}

export interface BalanceResponse {
  user_id: string;
  wallet_id: string;
  balance: number;
  currency: string;
}

export interface TransactionHistoryItem {
  id: string;
  type: 'DEPOSIT' | 'TRANSFER';
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  counterparty_name?: string;
  created_at: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
}

export const authApi = {
  register: (name: string, email: string, password: string) =>
    api.post<{ success: boolean; data: AuthResponse }>('/auth/register', {
      name,
      email,
      password,
    }),

  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: AuthResponse }>('/auth/login', {
      email,
      password,
    }),
};

export const usersApi = {
  listAll: () =>
    api.get<{ success: boolean; data: User[] }>('/users'),
  getMe: () =>
    api.get<{ success: boolean; data: User }>('/users/me'),
};

export const walletApi = {
  getBalance: (userId: string) =>
    api.get<{ success: boolean; data: BalanceResponse }>(`/wallet/${userId}/balance`),

  getTransactions: (userId: string, limit = 50, offset = 0) =>
    api.get<{
      success: boolean;
      data: { transactions: TransactionHistoryItem[]; pagination: object };
    }>(`/wallet/${userId}/transactions`, { params: { limit, offset } }),

  deposit: (userId: string, amount: number, idempotencyKey: string) =>
    api.post<{ success: boolean; data: { transaction: object } }>(
      '/wallet/deposit',
      { user_id: userId, amount },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    ),

  transfer: (
    fromUserId: string,
    toUserId: string,
    amount: number,
    idempotencyKey: string
  ) =>
    api.post<{ success: boolean; data: { transaction: object } }>(
      '/wallet/transfer',
      { from_user_id: fromUserId, to_user_id: toUserId, amount },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    ),
};
