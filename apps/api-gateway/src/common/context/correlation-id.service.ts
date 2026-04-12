import { correlationIdStorage } from "./correlation-id.context";

export class CorrelationIdService {
  static getId(): string | undefined {
    return correlationIdStorage.getStore()?.correlationId;
  }
}