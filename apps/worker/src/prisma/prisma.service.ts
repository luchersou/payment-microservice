import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'; 
import { Pool } from 'pg'; 

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool; 

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, 
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    const adapter = new PrismaPg(pool);

    super({ adapter });
    
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    console.log('🗄️ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end(); 
    console.log('🗄️ Database disconnected');
  }
}