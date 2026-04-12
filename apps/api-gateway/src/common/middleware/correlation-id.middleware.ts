import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

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

  next();
}