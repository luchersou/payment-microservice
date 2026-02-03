import { BaseAppError } from './base.error';

export class ConflictError extends BaseAppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}
