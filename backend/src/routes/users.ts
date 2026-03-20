import { Router, Request, Response, NextFunction } from 'express';
import { createUser, getUserById, listUsers } from '../services/userService';
import { validate } from '../middleware/validate';
import { createUserSchema } from '../validators/schemas';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /users
 * Spec-compliant user + wallet creation endpoint.
 * Proxies to the same service method as /auth/register.
 */
router.post(
  '/',
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await createUser(req.body);
      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          wallet: result.wallet,
          token: result.token,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /users/me
 * Returns the authenticated user's profile.
 */
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await getUserById(req.user!.userId);
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /users
 * Lists all users except the requester (for transfer target picker).
 */
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await listUsers(req.user!.userId);
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
