"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentDeclinedEvent = void 0;
const base_event_1 = require("./base.event");
const event_types_enum_1 = require("../types/event-types.enum");
class PaymentDeclinedEvent extends base_event_1.BaseEvent {
    constructor() {
        super(...arguments);
        this.eventType = event_types_enum_1.EventTypes.PAYMENT_DECLINED;
    }
}
exports.PaymentDeclinedEvent = PaymentDeclinedEvent;
//# sourceMappingURL=payment-declined.event.js.map