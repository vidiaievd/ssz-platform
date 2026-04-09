import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global() makes PrismaService available everywhere without re-importing PrismaModule.
// Justified because every feature module that touches the DB needs it — avoiding
// boilerplate imports in every module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
