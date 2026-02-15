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
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const http_client_helper_1 = require("../../common/http-client.helper");
let PaymentsService = class PaymentsService {
    constructor(http, configService) {
        this.http = http;
        this.configService = configService;
        this.baseUrl = this.configService.get('PAYMENT_SERVICE_URL', 'http://payment-service:3002');
        this.requestTimeout = this.configService.get('REQUEST_TIMEOUT', 5000);
    }
    async findAll(page, limit) {
        return (0, http_client_helper_1.makeHttpRequest)(this.http.get(`${this.baseUrl}/payments`, {
            params: { page, limit },
        }), this.requestTimeout);
    }
    async getPaymentStats() {
        return (0, http_client_helper_1.makeHttpRequest)(this.http.get(`${this.baseUrl}/payments/stats`), this.requestTimeout);
    }
    async findOne(id) {
        return (0, http_client_helper_1.makeHttpRequest)(this.http.get(`${this.baseUrl}/payments/${id}`), this.requestTimeout, `Payment ${id} not found`);
    }
    async findByOrderId(orderId) {
        return (0, http_client_helper_1.makeHttpRequest)(this.http.get(`${this.baseUrl}/payments/order/${orderId}`), this.requestTimeout, `Payment for order ${orderId} not found`);
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map