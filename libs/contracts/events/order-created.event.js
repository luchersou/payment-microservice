"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCreatedEvent = void 0;
const base_event_1 = require("./base.event");
const event_types_enum_1 = require("../types/event-types.enum");
class OrderCreatedEvent extends base_event_1.BaseEvent {
    constructor() {
        super(...arguments);
        this.eventType = event_types_enum_1.EventTypes.ORDER_CREATED;
    }
}
exports.OrderCreatedEvent = OrderCreatedEvent;
//# sourceMappingURL=order-created.event.js.map