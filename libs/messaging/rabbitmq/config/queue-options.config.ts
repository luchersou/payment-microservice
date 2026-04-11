import { Exchanges } from '../constants/exchanges.constant';
import { DLQ } from '../constants/dlq.constant';

export const ORDER_PROCESS_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.ORDER_PROCESS,
  },
};

export const PAYMENT_PROCESS_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.PAYMENT_PROCESS,
  },
};

export const ORDER_PAYMENT_RESULT_QUEUE_OPTIONS = {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': Exchanges.DLX,
    'x-dead-letter-routing-key': DLQ.ORDER_PAYMENT_RESULT,
  },
};