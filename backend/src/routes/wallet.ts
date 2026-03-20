import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  depositSchema,
  transferSchema,
  userIdParamSchema,
} from '../validators/schemas';
import {
  deposit,
  transfer,
  getBalance,
  getTransactionHistory,
} from '../services/walletService';
import { AuthorizationError } from '../errors/AppError';

const router = Router();

// All wallet routes require authentication
router.use(authenticate);

/**
 * POST /wallet/deposit
 * Deposits funds into a user's wallet.
 *
 * Security note: We verify the requesting user matches the target user_id.
 * This prevents one user from depositing to another's wallet via the API.
 * (In a real system, deposits come from a payment gateway, not user-initiated.)
 *
 * Idempotency: Pass Idempotency-Key header to make this operation idempotent.
 */
router.post(
  '/deposit',
  validate(depositSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, amount } = req.body;
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Authorization: users can only deposit to their own wallet
      if (user_id !== req.user!.userId) {
        throw new AuthorizationError('You can only deposit to your own wallet');
      }

      const transaction = await deposit(user_id, amount, idempotencyKey);

      res.status(201).json({
        success: true,
        data: {
          transaction,
          message: `Successfully deposited ₦${amount.toLocaleString()} to wallet`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /wallet/transfer
 * Transfers funds between two users atomically.
 *
 * Idempotency: Pass Idempotency-Key header to safely retry transfers.
 */
router.post(
  '/transfer',
  validate(transferSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from_user_id, to_user_id, amount } = req.body;
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Authorization: authenticated user must be the sender
      if (from_user_id !== req.user!.userId) {
        throw new AuthorizationError('You can only transfer from your own wallet');
      }

      const transaction = await transfer(from_user_id, to_user_id, amount, idempotencyKey);

      res.status(201).json({
        success: true,
        data: {
          transaction,
          message: `Successfully transferred ₦${amount.toLocaleString()}`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /wallet/:user_id/balance
 * Returns the derived balance for a user's wallet.
 */
router.get(
  '/:user_id/balance',
  validate(userIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id } = req.params;

      // Users can only view their own balance (adjust if admin roles needed)
      if (user_id !== req.user!.userId) {
        throw new AuthorizationError('You can only view your own balance');
      }

      const balance = await getBalance(user_id);
      res.json({ success: true, data: balance });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /wallet/:user_id/transactions
 * Returns paginated transaction history.
 */
router.get(
  '/:user_id/transactions',
  validate(userIdParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id } = req.params;

      if (user_id !== req.user!.userId) {
        throw new AuthorizationError('You can only view your own transactions');
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const transactions = await getTransactionHistory(user_id, limit, offset);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: { limit, offset, count: transactions.length },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
