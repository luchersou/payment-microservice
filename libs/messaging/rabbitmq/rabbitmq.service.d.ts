import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
export declare class RabbitMQService implements OnModuleInit, OnModuleDestroy {
    private connection;
    private channel;
    private readonly logger;
    onModuleInit(): Promise<void>;
    private connect;
    publish<T>(exchange: string, routingKey: string, message: T): Promise<void>;
    consume<T>(queue: string, exchange: string, routingKey: string, handler: (message: T) => Promise<void>): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
