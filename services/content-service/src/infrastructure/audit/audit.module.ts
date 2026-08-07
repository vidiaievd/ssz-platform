import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG } from '../../shared/application/ports/audit-log.port.js';
import { PrismaAuditLog } from './prisma-audit-log.js';

// @Global(), like PrismaModule: every feature module writes history, and making
// each one import a module to do so would be plumbing without a decision in it.
@Global()
@Module({
  providers: [{ provide: AUDIT_LOG, useClass: PrismaAuditLog }],
  exports: [AUDIT_LOG],
})
export class AuditModule {}
