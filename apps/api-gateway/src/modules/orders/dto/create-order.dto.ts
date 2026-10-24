import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  userId: string;

  /** Integer amount in cents (e.g. 1999 = 19.99): floats are rejected */
  @IsInt()
  @IsPositive()
  totalCents: number;
}
