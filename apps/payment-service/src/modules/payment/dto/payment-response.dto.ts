export class PaymentResponseDto {
  id: string;
  orderId: string;
  /** Null when the order was cancelled before the payment was requested */
  amount: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
