import { Module } from '@nestjs/common';
import { PublishSnapshotsHandler } from './application/commands/publish-snapshots/publish-snapshots.handler.js';
import { ENTITLEMENT_INPUTS_READER } from './application/ports/entitlement-inputs.reader.js';
import { ENTITLEMENT_SNAPSHOT_STORE } from './application/ports/entitlement-snapshot.store.js';
import { ORGANIZATION_CLIENT } from './application/ports/organization.client.js';
import { GetMyEntitlementsHandler } from './application/queries/get-my-entitlements/get-my-entitlements.handler.js';
import { ResolveEntitlementsHandler } from './application/queries/resolve-entitlements/resolve-entitlements.handler.js';
import { PrismaEntitlementSnapshotStore } from './infrastructure/events/prisma-entitlement-snapshot.store.js';
import { HttpOrganizationClient } from './infrastructure/http/http-organization.client.js';
import { PrismaEntitlementInputsReader } from './infrastructure/persistence/prisma-entitlement-inputs.reader.js';
import { InternalEntitlementsController } from './presentation/controllers/internal-entitlements.controller.js';
import { MyEntitlementsController } from './presentation/controllers/my-entitlements.controller.js';
import { SnapshotPublisherJob } from './presentation/jobs/snapshot-publisher.job.js';

/**
 * Resolving entitlements — on request (`/internal/entitlements`, `/subscriptions/me`) and
 * as `subscription.entitlements.changed` snapshots whenever an account's revision moves.
 */
@Module({
  controllers: [InternalEntitlementsController, MyEntitlementsController],
  providers: [
    ResolveEntitlementsHandler,
    GetMyEntitlementsHandler,
    PublishSnapshotsHandler,
    SnapshotPublisherJob,
    { provide: ENTITLEMENT_INPUTS_READER, useClass: PrismaEntitlementInputsReader },
    { provide: ENTITLEMENT_SNAPSHOT_STORE, useClass: PrismaEntitlementSnapshotStore },
    { provide: ORGANIZATION_CLIENT, useClass: HttpOrganizationClient },
  ],
})
export class EntitlementsModule {}
