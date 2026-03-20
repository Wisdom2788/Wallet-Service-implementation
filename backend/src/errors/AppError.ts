/**
 * Structured error hierarchy for the wallet service.
 * Using typed errors rather than string messages allows middleware
 * to map errors to HTTP status codes cleanly and consistently.
 */

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super('Insufficient funds for this transaction', 422, 'INSUFFICIENT_FUNDS');
  }
}

export class IdempotencyConflictError extends AppError {
  public readonly existingData: unknown;
  constructor(existingData: unknown) {
    super('Duplicate request detected — returning cached result', 200, 'IDEMPOTENT_REPLAY');
    this.existingData = existingData;
  }
}
