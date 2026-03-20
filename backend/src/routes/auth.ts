import { Router, Request, Response, NextFunction } from 'express';
import { createUser, loginUser } from '../services/userService';
import { validate } from '../middleware/validate';
import { createUserSchema, loginSchema } from '../validators/schemas';

const router = Router();

router.post(
  '/register',
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


router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await loginUser(req.body);
      res.json({
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

export default router;
