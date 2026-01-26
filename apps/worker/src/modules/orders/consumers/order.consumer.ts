import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { OrderProcessingService } from '../services/order-processing.service';

@Controller()
export class OrderConsumer {
  constructor(private readonly processingService: OrderProcessingService) {}

  @EventPattern('order.created')
  async handleOrderCreated(@Payload() data: any) {
    console.log('Event received:', data);

    await this.processingService.process(data);
  }
}
