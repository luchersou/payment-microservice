import { NestFactory } from '@nestjs/core';
import { PaymentModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(PaymentModule);

  console.log('💳 Payment Service is listening for events...');
}

bootstrap();
