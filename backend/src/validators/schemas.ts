import { z } from 'zod';

// ─── Reusable field definitions ───────────────────────────────────────────────

const uuidField = z.string().uuid('Must be a valid UUID');

/**
 * Amount field: must be a positive number with at most 2 decimal places.
 * We reject amounts like 100.001 to prevent precision issues.
 * Minimum of 0.01 (1 kobo) — zero transfers are rejected.
 */
const amountField = z
  .number({ invalid_type_error: 'Amount must be a number' })
  .positive('Amount must be greater than 0')
  .max(1_000_000_000, 'Amount exceeds maximum allowed per transaction')
  .refine(
    (val) => Number((val * 100).toFixed(0)) === val * 100,
    'Amount must have at most 2 decimal places'
  );

const emailField = z
  .string()
  .email('Must be a valid email address')
  .toLowerCase()
  .trim();

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

// ─── Request Schemas ──────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .trim(),
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export const depositSchema = z.object({
  user_id: uuidField,
  amount: amountField,
});

export const transferSchema = z.object({
  from_user_id: uuidField,
  to_user_id: uuidField,
  amount: amountField,
}).refine(
  (data) => data.from_user_id !== data.to_user_id,
  { message: 'Cannot transfer to yourself', path: ['to_user_id'] }
);

export const userIdParamSchema = z.object({
  user_id: uuidField,
});

// ─── Types inferred from schemas ──────────────────────────────────────────────

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
