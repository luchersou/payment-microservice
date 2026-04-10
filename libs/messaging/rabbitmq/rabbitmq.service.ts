import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { Channel, ChannelModel } from 'amqplib';

import { BaseEvent } from '@contracts/events/base.event';
import { EventTypes } from '@contracts/types/event-types.enum';

import { setupRabbitMQ } from './config/rabbitmq.config';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null; 
  private channel: Channel | null = null;
  private connecting: Promise<void> | null = null;

  private readonly logger = new Logger(RabbitMQService.name);

  async onModuleInit() {
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connection && this.channel) return;

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

      try {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();

        this.connection.on('error', (err) => {
          this.logger.error('RabbitMQ connection error:', err);
        });

        this.connection.on('close', () => {
          this.logger.warn('RabbitMQ connection closed. Reconnecting...');

          this.connection = null;
          this.channel = null;
          this.connecting = null;

          setTimeout(() => this.connect(), 5000);
        });

        await this.channel.prefetch(10);
        await setupRabbitMQ(this.channel);

        this.logger.log('RabbitMQ connected and configured ✅');
      } catch (error) {
        this.logger.error('Failed to connect to RabbitMQ:', error);

        this.connecting = null;
        setTimeout(() => this.connect(), 5000);
      }
    })();

    return this.connecting;
  }

  private async publishOnce<TPayload>(
    exchange: string,
    routingKey: string,
    message: BaseEvent<TPayload>,
  ): Promise<void> {
    await this.connect();

    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }

    const success = this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true },
    );

    if (!success) {
      throw new Error('RabbitMQ publish failed (buffer full)');
    }
  }

  async publish<TPayload>(
    exchange: string,
    routingKey: string,
    message: BaseEvent<TPayload>,
    options?: {
      retries?: number;
      delay?: number;
    },
  ): Promise<void> {
    const retries = options?.retries ?? 3;
    const baseDelay = options?.delay ?? 500;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.publishOnce(exchange, routingKey, message);

        this.logger.debug(
          `✅ Published to ${exchange}/${routingKey} (attempt ${attempt})`,
        );

        return;
      } catch (error) {
        this.logger.warn(
          `⚠️ Publish failed (attempt ${attempt}/${retries})`,
        );

        if (attempt === retries) {
          this.logger.error(
            `❌ Failed to publish after ${retries} attempts`,
          );
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);

        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  async consume<T extends { eventType: EventTypes }>(
    queue: string,
    handler: (message: T) => Promise<void>,
  ): Promise<void> {
    await this.connect();

    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString()) as T;
        await handler(content);
        this.channel!.ack(msg);
      } catch (err) {
        this.channel!.nack(msg, false, false);
      }
    });
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close(); 
  }
}