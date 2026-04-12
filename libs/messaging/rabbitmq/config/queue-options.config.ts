import { DLQ } from '../constants/dlq.constant';
import { Exchanges } from '../constants/exchanges.constant';

export const ORDER_CREATE_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.ORDER_CREATE,
  },
};

export const ORDER_CANCEL_REQUESTED_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.ORDER_CANCEL_REQUESTED,
  },
};

export const ORDER_PAYMENT_RESULT_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.ORDER_PAYMENT_RESULT,
  },
};

export const PAYMENT_ORDER_CREATED_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.PAYMENT_ORDER_CREATED,
  },
};

export const PAYMENT_ORDER_CANCELLED_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.PAYMENT_ORDER_CANCELLED,
  },
};
