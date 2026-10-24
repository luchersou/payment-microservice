export class OrderResponseDto {
  id: string;
  /** userId and total are null when the order was cancelled before creation */
  userId: string | null;
  total: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
