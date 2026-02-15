"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var RabbitMQService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RabbitMQService = void 0;
const common_1 = require("@nestjs/common");
const amqp = __importStar(require("amqplib"));
const rabbitmq_config_1 = require("./config/rabbitmq.config");
let RabbitMQService = RabbitMQService_1 = class RabbitMQService {
    constructor() {
        this.logger = new common_1.Logger(RabbitMQService_1.name);
    }
    async onModuleInit() {
        await this.connect();
    }
    async connect() {
        if (this.connection && this.channel)
            return;
        const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
        try {
            this.connection = await amqp.connect(url);
            this.channel = await this.connection.createChannel();
            this.connection.on('error', (err) => {
                this.logger.error('RabbitMQ connection error:', err);
            });
            this.connection.on('close', () => {
                this.logger.warn('RabbitMQ connection closed. Reconnecting...');
                setTimeout(() => this.connect(), 5000);
            });
            await this.channel.prefetch(10);
            await (0, rabbitmq_config_1.setupRabbitMQ)(this.channel);
            this.logger.log('RabbitMQ connected and configured ✅');
        }
        catch (error) {
            this.logger.error('Failed to connect to RabbitMQ:', error);
            setTimeout(() => this.connect(), 5000);
        }
    }
    async publish(exchange, routingKey, message) {
        const success = this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), { persistent: true });
        if (!success) {
            this.logger.error(`Failed to publish message to ${exchange}/${routingKey}`);
            throw new Error('Failed to publish message to RabbitMQ');
        }
        this.logger.debug(`✅ Published to ${exchange}/${routingKey}: ${JSON.stringify(message)}`);
    }
    async consume(queue, exchange, routingKey, handler) {
        await this.channel.bindQueue(queue, exchange, routingKey);
        await this.channel.consume(queue, async (msg) => {
            if (!msg)
                return;
            try {
                const content = JSON.parse(msg.content.toString());
                await handler(content);
                this.channel.ack(msg);
            }
            catch (err) {
                this.channel.nack(msg, false, false);
            }
        });
    }
    async onModuleDestroy() {
        await this.channel?.close();
        await this.connection?.close();
    }
};
exports.RabbitMQService = RabbitMQService;
exports.RabbitMQService = RabbitMQService = RabbitMQService_1 = __decorate([
    (0, common_1.Injectable)()
], RabbitMQService);
//# sourceMappingURL=rabbitmq.service.js.map