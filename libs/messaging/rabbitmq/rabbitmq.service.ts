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

  async connect() {
    try {
      const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await setupRabbitMQ(this.channel);

      this.logger.log('RabbitMQ connected and configured ✅');
    } catch (error) {
      this.logger.error('RabbitMQ connection failed ❌', error);
      setTimeout(() => this.connect(), 5000); // automatic retry
    }
  }

  async publish(exchange: string, routingKey: string, message: any) {
    if (!this.channel) {
      this.logger.error('Channel not initialized');
      return;
    }

    const payload = Buffer.from(JSON.stringify(message));

    this.channel.publish(exchange, routingKey, payload, {
      persistent: true,
    });

    this.logger.log(`📤 Event published → ${routingKey}`);
  }

  async consume(queue: string, callback: (msg: any) => void) {
    if (!this.channel) {
      this.logger.error('Channel not initialized');
      return;
    }

    await this.channel.consume(queue, (msg) => {
      if (!msg) return;

      const content = JSON.parse(msg.content.toString());
      this.logger.log(`📥 Event received from ${queue}`);

      try {
        callback(content);
        this.channel.ack(msg);
      } catch (err) {
        this.logger.error('Error processing message', err);
        this.channel.nack(msg, false, false);
      }
    });
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
