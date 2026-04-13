import { correlationIdStorage } from '@common/context/correlation-id.context';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incomingCorrelationId = req.headers['x-correlation-id'];

  const correlationId =
    typeof incomingCorrelationId === 'string'
      ? incomingCorrelationId
      : randomUUID();

  (req as any).correlationId = correlationId;

  res.setHeader('x-correlation-id', correlationId);

  correlationIdStorage.run({ correlationId }, () => next());
}
