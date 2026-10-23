import { IsInt, IsUrl, Min } from 'class-validator';

import { BaseEnvironment } from '@common/config';

export class GatewayEnvironment extends BaseEnvironment {
  PORT = 3000;

  @IsUrl({ require_tld: false })
  ORDER_SERVICE_URL = 'http://localhost:3001';

  @IsUrl({ require_tld: false })
  PAYMENT_SERVICE_URL = 'http://localhost:3002';

  @IsInt()
  @Min(1)
  REQUEST_TIMEOUT = 5000;
}
