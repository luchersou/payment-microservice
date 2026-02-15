"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRabbitMQ = setupRabbitMQ;
const exchanges_constant_1 = require("../constants/exchanges.constant");
const queues_constant_1 = require("../constants/queues.constant");
const dlq_constant_1 = require("../constants/dlq.constant");
async function setupRabbitMQ(channel) {
    await channel.assertExchange(exchanges_constant_1.Exchanges.ORDERS, 'topic', {
        durable: true,
    });
    await channel.assertExchange(exchanges_constant_1.Exchanges.PAYMENTS, 'topic', {
        durable: true,
    });
    await channel.assertExchange(exchanges_constant_1.Exchanges.DLX, 'topic', {
        durable: true,
    });
    await channel.assertQueue(queues_constant_1.Queues.ORDER_PROCESS, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': exchanges_constant_1.Exchanges.DLX,
            'x-dead-letter-routing-key': dlq_constant_1.DLQ.ORDER_PROCESS,
        },
    });
    await channel.assertQueue(queues_constant_1.Queues.PAYMENT_PROCESS, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': exchanges_constant_1.Exchanges.DLX,
            'x-dead-letter-routing-key': dlq_constant_1.DLQ.PAYMENT_PROCESS,
        },
    });
    await channel.assertQueue(queues_constant_1.Queues.PAYMENT_RESULT, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': exchanges_constant_1.Exchanges.DLX,
            'x-dead-letter-routing-key': dlq_constant_1.DLQ.PAYMENT_RESULT,
        },
    });
    await channel.assertQueue(dlq_constant_1.DLQ.ORDER_PROCESS, {
        durable: true,
    });
    await channel.assertQueue(dlq_constant_1.DLQ.PAYMENT_PROCESS, {
        durable: true,
    });
    await channel.assertQueue(dlq_constant_1.DLQ.PAYMENT_RESULT, {
        durable: true,
    });
    await channel.bindQueue(dlq_constant_1.DLQ.ORDER_PROCESS, exchanges_constant_1.Exchanges.DLX, dlq_constant_1.DLQ.ORDER_PROCESS);
    await channel.bindQueue(dlq_constant_1.DLQ.PAYMENT_PROCESS, exchanges_constant_1.Exchanges.DLX, dlq_constant_1.DLQ.PAYMENT_PROCESS);
    await channel.bindQueue(dlq_constant_1.DLQ.PAYMENT_RESULT, exchanges_constant_1.Exchanges.DLX, dlq_constant_1.DLQ.PAYMENT_RESULT);
}
//# sourceMappingURL=rabbitmq.config.js.map