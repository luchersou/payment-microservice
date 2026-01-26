import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // POST /orders
  @Post()
  async createOrder(@Body() body: { total: number }) {
    return this.ordersService.createOrder(body.total);
  }

  // GET /orders/:id
  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  // GET /orders
  @Get()
  async listOrders() {
    return this.ordersService.findAll();
  }

  // PATCH /orders/:id/cancel
  @Patch(':id/cancel')
  async cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }
}
