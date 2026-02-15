import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { Channel, Connection } from 'amqplib';
import { setupRabbitMQ } from './config/rabbitmq.config';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: Connection;
  private channel: Channel;
  private readonly logger = new Logger(RabbitMQService.name);

  async onModuleInit() {
    await this.connect();
  }

 private async connect() {
    if (this.connection && this.channel) return;

    const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed. Reconnecting...');
        setTimeout(() => this.connect(), 5000); 
      });

      await this.channel.prefetch(10);
      await setupRabbitMQ(this.channel);

      this.logger.log('RabbitMQ connected and configured ✅');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      setTimeout(() => this.connect(), 5000); 
    }
  }

  async publish<T>(
    exchange: string,
    routingKey: string,
    message: T,
  ): Promise<void> {
    const success = this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true },
    );

    if (!success) {
      this.logger.error(
        `Failed to publish message to ${exchange}/${routingKey}`,
      );
      throw new Error('Failed to publish message to RabbitMQ');
    }

    this.logger.debug(
      `✅ Published to ${exchange}/${routingKey}: ${JSON.stringify(message)}`,
    );
  }

  async consume<T>(
    queue: string,
    exchange: string,
    routingKey: string,
    handler: (message: T) => Promise<void>,
  ): Promise<void> {

    await this.channel.bindQueue(queue, exchange, routingKey);

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString()) as T;
        await handler(content);
        this.channel.ack(msg);
      } catch (err) {
        this.channel.nack(msg, false, false);
      }
    });
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
