import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global() — PrismaService is injected across all feature modules
// without needing to re-import PrismaModule everywhere.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
