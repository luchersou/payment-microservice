import { correlationIdStorage } from '@common/context/correlation-id.context';
import { ConsumeMessage } from 'amqplib';

export function runWithCorrelation(
  amqpMsg: ConsumeMessage,
  callback: () => Promise<void> | void,
) {
  const correlationId = amqpMsg.properties.correlationId;

  return correlationIdStorage.run({ correlationId }, callback);
}
