"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseEvent = void 0;
class BaseEvent {
    constructor(payload) {
        this.eventId = crypto.randomUUID();
        this.occurredAt = new Date();
        this.payload = payload;
    }
}
exports.BaseEvent = BaseEvent;
//# sourceMappingURL=base.event.js.map