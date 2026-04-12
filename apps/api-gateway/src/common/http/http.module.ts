import { Global, Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { setupAxiosInterceptors } from './http-client.provider';

@Global()
@Module({
  imports: [HttpModule],
  exports: [HttpModule],
})
export class CustomHttpModule implements OnModuleInit {
  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    setupAxiosInterceptors(this.httpService);
  }
}