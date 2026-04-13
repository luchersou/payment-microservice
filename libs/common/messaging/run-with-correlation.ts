import { ConsumeMessage } from 'amqplib';

import { correlationIdStorage } from '@common/context';

export function runWithCorrelation(
  amqpMsg: ConsumeMessage,
  callback: () => Promise<void> | void,
) {
  const correlationId = amqpMsg.properties.correlationId;

  return correlationIdStorage.run({ correlationId }, callback);
}
