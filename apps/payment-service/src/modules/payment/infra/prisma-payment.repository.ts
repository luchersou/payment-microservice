import { Injectable } from '@nestjs/common';

import {
  type Payment as PaymentRecord,
  Prisma,
} from '@payment/prisma/generated/prisma/client';
import { PrismaService } from '@payment/prisma/prisma.service';

import { Payment } from '../domain/payment';
import { PaymentStatus } from '../domain/payment-status';
import { PaymentRepository } from '../domain/ports/payment.repository';
import { toPaymentOutboxRecord } from './payment-outbox-events';

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { orderId } });
    return record ? toDomain(record) : null;
  }

  createProcessing(
    orderId: string,
    amountCents: number,
  ): Promise<Payment | null> {
    return this.createUnlessExists({
      orderId,
      amountCents,
      status: PaymentStatus.PROCESSING,
    });
  }

  createCancelledTombstone(orderId: string): Promise<Payment | null> {
    return this.createUnlessExists({
      orderId,
      status: PaymentStatus.CANCELLED,
    });
  }

  /**
   * Conditional update on the status the payment was read with, plus one
   * outbox row per pending event, in one transaction: the event exists if
   * and only if the change it announces was committed.
   */
  async save(payment: Payment): Promise<boolean> {
    const events = payment.pullEvents();

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.loadedStatus },
        data: {
          status: payment.status,
          failureReason: payment.failureReason,
        },
      });

      if (count !== 1) return false;

      for (const event of events) {
        await tx.outboxMessage.create({ data: toPaymentOutboxRecord(event) });
      }

      return true;
    });
  }

  async findStuckProcessing(
    updatedBefore: Date,
    limit: number,
  ): Promise<Payment[]> {
    const records = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PROCESSING,
        updatedAt: { lt: updatedBefore },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    return records.map(toDomain);
  }

  /** The unique orderId turns a concurrent or repeated create into null */
  private async createUnlessExists(data: {
    orderId: string;
    amountCents?: number;
    status: PaymentStatus;
  }): Promise<Payment | null> {
    try {
      return toDomain(await this.prisma.payment.create({ data }));
    } catch (error) {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    }
  }
}

function toDomain(record: PaymentRecord): Payment {
  return Payment.fromProps({
    id: record.id,
    orderId: record.orderId,
    amountCents: record.amountCents,
    status: record.status,
    failureReason: record.failureReason,
  });
}

/** Prisma's unique constraint violation: the record already exists */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
