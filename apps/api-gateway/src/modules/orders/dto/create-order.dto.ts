import { IsUUID, IsPositive, IsNumber } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  userId: string;

  @IsNumber()
  @IsPositive()
  total: number;
}
