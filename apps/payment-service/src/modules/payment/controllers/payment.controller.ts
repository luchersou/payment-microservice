import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { PaymentQueriesService } from '../application/payment-queries.service';
import { PaginatedPaymentsResponseDto } from '../dto/paginated-payments-response.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { PaymentStatsResponseDto } from '../dto/payment-stats-response.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly queries: PaymentQueriesService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<PaginatedPaymentsResponseDto> {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    return this.queries.findAll(pageNumber, limitNumber);
  }

  @Get('stats')
  async getStats(): Promise<PaymentStatsResponseDto> {
    return this.queries.getStats();
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentResponseDto> {
    return this.queries.findOne(id);
  }

  @Get('order/:orderId')
  async findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentResponseDto> {
    return this.queries.findByOrderId(orderId);
  }
}
