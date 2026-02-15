"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventTypes = void 0;
var EventTypes;
(function (EventTypes) {
    EventTypes["ORDER_CREATED"] = "OrderCreated";
    EventTypes["ORDER_CANCELLED"] = "OrderCancelled";
    EventTypes["ORDER_CANCEL_REQUESTED"] = "OrderCancelRequested";
    EventTypes["PAYMENT_APPROVED"] = "PaymentApproved";
    EventTypes["PAYMENT_DECLINED"] = "PaymentDeclined";
    EventTypes["PAYMENT_FAILED"] = "PaymentFailed";
})(EventTypes || (exports.EventTypes = EventTypes = {}));
//# sourceMappingURL=event-types.enum.js.map