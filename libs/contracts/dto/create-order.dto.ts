export class CreateOrderDto {
  customerId: string;
  items: {
    product: string;
    price: number;
    quantity: number;
  }[];
}
