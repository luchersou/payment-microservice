import { Controller, Get, Query, Param } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaginatedPaymentsResponseDto } from './dto/paginated-payments-response.dto';
import { PaymentStatsResponseDto } from './dto/payment-stats-response.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<PaginatedPaymentsResponseDto> {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    return this.paymentService.findAll(pageNumber, limitNumber);
  }

  @Get('stats')
  async getStats(): Promise<PaymentStatsResponseDto> {
    return this.paymentService.getStats();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PaymentResponseDto> {
    return this.paymentService.findOne(id);
  }

  @Get('order/:orderId')
  async findByOrder(@Param('orderId') orderId: string): Promise<PaymentResponseDto> {
    return this.paymentService.findByOrderId(orderId);
  }
}