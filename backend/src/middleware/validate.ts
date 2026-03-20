import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/AppError';

type RequestLocation = 'body' | 'params' | 'query';

/**
 * Generic Zod validation middleware factory.
 * Validates the specified part of the request and attaches
 * the parsed (and type-coerced) data back to the request.
 */
export function validate(schema: ZodSchema, location: RequestLocation = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[location]);
      // Replace raw input with validated/transformed data
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
