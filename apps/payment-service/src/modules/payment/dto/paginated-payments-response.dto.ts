import { PaymentResponseDto } from './payment-response.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

export class PaginatedPaymentsResponseDto {
  data: PaymentResponseDto[];
  meta: PaginationMetaDto;
}