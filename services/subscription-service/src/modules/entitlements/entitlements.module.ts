import { Module } from '@nestjs/common';
import { ENTITLEMENT_INPUTS_READER } from './application/ports/entitlement-inputs.reader.js';
import { ORGANIZATION_CLIENT } from './application/ports/organization.client.js';
import { GetMyEntitlementsHandler } from './application/queries/get-my-entitlements/get-my-entitlements.handler.js';
import { ResolveEntitlementsHandler } from './application/queries/resolve-entitlements/resolve-entitlements.handler.js';
import { HttpOrganizationClient } from './infrastructure/http/http-organization.client.js';
import { PrismaEntitlementInputsReader } from './infrastructure/persistence/prisma-entitlement-inputs.reader.js';
import { InternalEntitlementsController } from './presentation/controllers/internal-entitlements.controller.js';
import { MyEntitlementsController } from './presentation/controllers/my-entitlements.controller.js';

@Module({
  controllers: [InternalEntitlementsController, MyEntitlementsController],
  providers: [
    ResolveEntitlementsHandler,
    GetMyEntitlementsHandler,
    { provide: ENTITLEMENT_INPUTS_READER, useClass: PrismaEntitlementInputsReader },
    { provide: ORGANIZATION_CLIENT, useClass: HttpOrganizationClient },
  ],
})
export class EntitlementsModule {}
