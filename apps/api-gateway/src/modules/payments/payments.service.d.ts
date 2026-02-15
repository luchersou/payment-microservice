import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
export declare class PaymentsService {
    private readonly http;
    private readonly configService;
    private readonly baseUrl;
    private readonly requestTimeout;
    constructor(http: HttpService, configService: ConfigService);
    findAll(page: number, limit: number): Promise<any>;
    getPaymentStats(): Promise<any>;
    findOne(id: string): Promise<any>;
    findByOrderId(orderId: string): Promise<any>;
}
