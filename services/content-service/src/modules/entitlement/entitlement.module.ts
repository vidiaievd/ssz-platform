import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaContentEntitlementRepository } from './infrastructure/persistence/prisma-content-entitlement.repository.js';
import { CONTENT_ENTITLEMENT_REPOSITORY } from './domain/repositories/content-entitlement.repository.interface.js';
import { ENTITLEMENT_LOOKUP } from '../../shared/access-control/domain/ports/entitlement-lookup.port.js';

import { GrantEntitlementHandler } from './application/commands/grant-entitlement/grant-entitlement.handler.js';
import { RevokeEntitlementHandler } from './application/commands/revoke-entitlement/revoke-entitlement.handler.js';
import { ListMyEntitlementsHandler } from './application/queries/list-my-entitlements/list-my-entitlements.handler.js';
import { GetEntitlementsForContainerHandler } from './application/queries/get-entitlements-for-container/get-entitlements-for-container.handler.js';

import { EntitlementController } from './presentation/controllers/entitlement.controller.js';

const CommandHandlers = [GrantEntitlementHandler, RevokeEntitlementHandler];
const QueryHandlers = [ListMyEntitlementsHandler, GetEntitlementsForContainerHandler];

@Module({
  imports: [CqrsModule],
  controllers: [EntitlementController],
  providers: [
    PrismaContentEntitlementRepository,
    { provide: CONTENT_ENTITLEMENT_REPOSITORY, useExisting: PrismaContentEntitlementRepository },
    { provide: ENTITLEMENT_LOOKUP, useExisting: PrismaContentEntitlementRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [CONTENT_ENTITLEMENT_REPOSITORY, ENTITLEMENT_LOOKUP],
})
export class EntitlementModule {}
