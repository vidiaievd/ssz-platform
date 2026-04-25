import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';
import type { AppConfig } from '../../config/configuration.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly config: ConfigService<AppConfig>) {
    const databaseUrl = config.get<AppConfig['database']>('database')?.url;
    // Prisma 7: adapter-based config and no-adapter config have incompatible union types.
    super(databaseUrl ? { adapter: new PrismaPg({ connectionString: databaseUrl }) } : ({} as any));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
