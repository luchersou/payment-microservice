import { Logger } from '@nestjs/common';
import { CorrelationIdService } from '@common/context';

export class CorrelationLogger extends Logger {
  private getPrefix(): string {
    const correlationId = CorrelationIdService.getId();
    return correlationId ? `[${correlationId}]` : '[NO-CORRELATION]';
  }

  log(message: string) {
    super.log(`${this.getPrefix()} ${message}`);
  }

  error(message: string, trace?: string) {
    super.error(`${this.getPrefix()} ${message}`, trace);
  }

  warn(message: string) {
    super.warn(`${this.getPrefix()} ${message}`);
  }

  debug(message: string) {
    super.debug(`${this.getPrefix()} ${message}`);
  }

  verbose(message: string) {
    super.verbose(`${this.getPrefix()} ${message}`);
  }
}
