import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    create(createOrderDto: CreateOrderDto): Promise<{
        orderId: string;
        message: string;
        status: string;
    }>;
    cancel(id: string): Promise<{
        orderId: string;
        message: string;
    }>;
    findAll(page?: string, limit?: string): Promise<any>;
    findOne(id: string): Promise<any>;
}
