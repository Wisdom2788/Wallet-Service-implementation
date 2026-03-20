import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/AppError';

type RequestLocation = 'body' | 'params' | 'query';

export function validate(schema: ZodSchema, location: RequestLocation = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[location]);
      
      (req as unknown as Record<string, unknown>)[location] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        next(new ValidationError(messages));
      } else {
        next(err);
      }
    }
  };
}
