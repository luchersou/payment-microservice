"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const exchanges_constant_1 = require("../../../../../libs/messaging/rabbitmq/constants/exchanges.constant");
const routing_keys_constant_1 = require("../../../../../libs/messaging/rabbitmq/constants/routing-keys.constant");
const rabbitmq_service_1 = require("../../../../../libs/messaging/rabbitmq/rabbitmq.service");
const event_types_enum_1 = require("../../../../../libs/contracts/types/event-types.enum");
const uuid_1 = require("uuid");
const http_client_helper_1 = require("../../common/http-client.helper");
const config_1 = require("@nestjs/config");
let OrdersService = class OrdersService {
    constructor(rabbit, http, configService) {
        this.rabbit = rabbit;
        this.http = http;
        this.configService = configService;
        this.orderServiceUrl = this.configService.get('ORDER_SERVICE_URL', 'http://localhost:3001');
        this.requestTimeout = this.configService.get('REQUEST_TIMEOUT', 5000);
    }
    async createOrder(createOrderDto) {
        const orderId = (0, uuid_1.v4)();
        await this.rabbit.publish(exchanges_constant_1.Exchanges.ORDERS, routing_keys_constant_1.RoutingKeys.ORDER_CREATED, {
            eventType: event_types_enum_1.EventTypes.ORDER_CREATED,
            payload: {
                orderId,
                userId: createOrderDto.userId,
                total: createOrderDto.total,
            },
        });
        return {
            orderId,
            message: 'Order creation request accepted',
            status: 'PENDING_PAYMENT',
        };
    }
    async cancelOrder(orderId) {
        await this.rabbit.publish(exchanges_constant_1.Exchanges.ORDERS, routing_keys_constant_1.RoutingKeys.ORDER_CANCEL_REQUESTED, {
            eventType: event_types_enum_1.EventTypes.ORDER_CANCEL_REQUESTED,
            payload: { orderId },
        });
        return {
            orderId,
            message: 'Order cancellation request accepted',
        };
    }
    async findAll(page, limit) {
        return (0, http_client_helper_1.makeHttpRequest)(this.http.get(`${this.orderServiceUrl}/orders`, {
            params: { page, limit },
        }), this.requestTimeout);
    }
    async findOne(id) {
        return (0, http_client_helper_1.makeHttpRequest)(this.http.get(`${this.orderServiceUrl}/orders/${id}`), this.requestTimeout, `Order ${id} not found`);
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rabbitmq_service_1.RabbitMQService,
        axios_1.HttpService,
        config_1.ConfigService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map