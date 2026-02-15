import { OrderResponseDto } from './order-response.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

export class PaginatedOrdersResponseDto {
  data: OrderResponseDto[];
  meta: PaginationMetaDto;
}