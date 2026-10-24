import { Injectable } from '@nestjs/common';

import type { Order as OrderRecord } from '@order/prisma/generated/prisma/client';
import { PrismaService } from '@order/prisma/prisma.service';

import { Order } from '../domain/order';
import { OrderRepository } from '../domain/ports/order.repository';
import { toOrderOutboxRecord } from './order-outbox-events';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  /** The order row and its outbox rows commit together, or not at all */
  async create(order: Order): Promise<boolean> {
    const events = order.pullEvents();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.create({
          data: {
            id: order.id,
            userId: order.userId,
            total: order.total,
            status: order.status,
          },
        });

        for (const event of events) {
          await tx.outboxMessage.create({ data: toOrderOutboxRecord(event) });
        }
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) return false;
      throw error;
    }
  }

  /**
   * Conditional update on the status the order was read with, plus one
   * outbox row per pending event, in one transaction.
   */
  async save(order: Order): Promise<boolean> {
    const events = order.pullEvents();

    if (order.loadedStatus === null) {
      throw new Error(`Order ${order.id} is new: create it instead`);
    }
    const loadedStatus = order.loadedStatus;

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: loadedStatus },
        data: { status: order.status },
      });

      if (count !== 1) return false;

      for (const event of events) {
        await tx.outboxMessage.create({ data: toOrderOutboxRecord(event) });
      }

      return true;
    });
  }
}

function toDomain(record: OrderRecord): Order {
  return Order.fromProps({
    id: record.id,
    userId: record.userId,
    total: record.total,
    status: record.status,
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
