import { BaseAppError } from './base.error';

export class NotFoundError extends BaseAppError {
  constructor(entity: string) {
    super(`${entity} not found`, 'NOT_FOUND', 404);
  }
}
