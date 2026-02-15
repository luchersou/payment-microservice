export declare abstract class BaseEvent<T> {
    eventId: string;
    occurredAt: Date;
    payload: T;
    constructor(payload: T);
}
