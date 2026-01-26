import { Injectable, OnModuleInit } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';

@Injectable()
export class OrderPublisher implements OnModuleInit {
  private client: ClientProxy;

  onModuleInit() {
    this.client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: ['amqp://localhost:5672'],
        queue: 'orders.processing.queue',
      },
    });
  }

  async publishOrderCreated(payload: any) {
    this.client.emit('order.created', payload);
    console.log('📤 Event order.created published', payload);
  }
}
