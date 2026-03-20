import { Request, Response, NextFunction } from 'express';
import { AppError, IdempotencyConflictError } from '../errors/AppError';


export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  
  if (err instanceof IdempotencyConflictError) {
    res.status(200).json({
      success: true,
      idempotent: true,
      data: err.existingData,
    });
    return;
  }

  
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if ((err as NodeJS.ErrnoException).code === '23505') {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A resource with that value already exists',
      },
    });
    return;
  }

  console.error('[Unhandled Error]', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
}
