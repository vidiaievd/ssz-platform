import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AdminActionConsumer } from './consumers/admin-action.consumer.js';
import { AdminAuditController } from './controllers/admin-audit.controller.js';
import { ListAdminAuditHandler } from './queries/list-admin-audit.handler.js';

/** The platform admins' trail across services (plan 90, phase 1, step 6). */
@Module({
  imports: [CqrsModule],
  controllers: [AdminAuditController],
  providers: [AdminActionConsumer, ListAdminAuditHandler],
})
export class AdminAuditModule {}
