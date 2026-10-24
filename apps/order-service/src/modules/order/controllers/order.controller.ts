import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { OrderQueriesService } from '../application/order-queries.service';
import { PaginatedOrdersResponseDto } from '../dto/paginated-orders-response.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly queries: OrderQueriesService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<PaginatedOrdersResponseDto> {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    return this.queries.findAll(pageNumber, limitNumber);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.queries.findOne(id);
    return order;
  }
}
