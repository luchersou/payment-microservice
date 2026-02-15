import { HttpService } from '@nestjs/axios';
import { CreateOrderDto } from './dto/create-order.dto';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { ConfigService } from '@nestjs/config';
export declare class OrdersService {
    private readonly rabbit;
    private readonly http;
    private readonly configService;
    private readonly orderServiceUrl;
    private readonly requestTimeout;
    constructor(rabbit: RabbitMQService, http: HttpService, configService: ConfigService);
    createOrder(createOrderDto: CreateOrderDto): Promise<{
        orderId: string;
        message: string;
        status: string;
    }>;
    cancelOrder(orderId: string): Promise<{
        orderId: string;
        message: string;
    }>;
    findAll(page: number, limit: number): Promise<any>;
    findOne(id: string): Promise<any>;
}
