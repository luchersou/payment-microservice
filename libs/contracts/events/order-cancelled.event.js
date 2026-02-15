"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCancelledEvent = void 0;
const base_event_1 = require("./base.event");
const event_types_enum_1 = require("../types/event-types.enum");
class OrderCancelledEvent extends base_event_1.BaseEvent {
    constructor() {
        super(...arguments);
        this.eventType = event_types_enum_1.EventTypes.ORDER_CANCELLED;
    }
}
exports.OrderCancelledEvent = OrderCancelledEvent;
//# sourceMappingURL=order-cancelled.event.js.map