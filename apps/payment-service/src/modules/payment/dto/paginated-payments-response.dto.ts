import { PaginationMetaDto } from './pagination-meta.dto';
import { PaymentResponseDto } from './payment-response.dto';

export class PaginatedPaymentsResponseDto {
  data: PaymentResponseDto[];
  meta: PaginationMetaDto;
}
