export class PaymentResponseDto {
  id: string;
  orderId: string;
  /** Null when the order was cancelled before the payment was requested */
  amount: number | null;
  status: string;
  /** Set when the payment is DECLINED or FAILED */
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
