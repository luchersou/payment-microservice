import { PaymentsService } from './payments.service';
export declare class PaymentsController {
    private readonly paymentsService;
    constructor(paymentsService: PaymentsService);
    findAll(page?: string, limit?: string): Promise<any>;
    getStats(): Promise<any>;
    findOne(id: string): Promise<any>;
    findByOrder(orderId: string): Promise<any>;
}
