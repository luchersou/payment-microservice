export class OrderResponseDto {
  id: string;
  /** userId and totalCents (integer cents) are null when the order was cancelled before creation */
  userId: string | null;
  totalCents: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
