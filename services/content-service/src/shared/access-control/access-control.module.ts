import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { VisibilityCheckerService } from './domain/services/visibility-checker.service.js';
import { ORGANIZATION_CLIENT } from './domain/ports/organization-client.port.js';
import { EntityResolverRegistry } from './infrastructure/registry/entity-resolver-registry.js';
import { HttpOrganizationClient } from './infrastructure/clients/http-organization-client.js';
import { VisibilityGuard } from './presentation/guards/visibility.guard.js';
import type { AppConfig } from '../../config/configuration.js';

// ─── Module graph note ───────────────────────────────────────────────────────
//
// AccessControlModule is split to break circular dependencies:
//
//   AccessControlCoreModule  (@Global)
//     provides: VisibilityCheckerService, EntityResolverRegistry,
//               VisibilityGuard, HttpOrganizationClient → ORGANIZATION_CLIENT
//     does NOT import ContentShareModule or EntitlementModule.
//     CONTENT_SHARE_LOOKUP and ENTITLEMENT_LOOKUP tokens are expected at runtime;
//     they are provided by ContentShareModule and EntitlementModule respectively,
//     which are imported in AppModule *after* AccessControlCoreModule resolves.
//
//   ContentShareModule
//     imports:  AccessControlCoreModule (for VisibilityCheckerService)
//     exports:  { provide: CONTENT_SHARE_LOOKUP, useExisting: PrismaContentShareRepository }
//
//   EntitlementModule
//     imports:  AccessControlCoreModule (for VisibilityCheckerService)
//     exports:  { provide: ENTITLEMENT_LOOKUP, useExisting: PrismaContentEntitlementRepository }
//
//   AppModule imports all three; the lookup tokens are globally visible because
//   AppModule provides them via re-export or direct provider registration.
//
// 'enroll' action is exposed for future use by Learning Service via internal RPC.
// No controller in Content Service uses it directly.
//
// ─────────────────────────────────────────────────────────────────────────────

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService<AppConfig>) => {
        const org = config.get<AppConfig['organization']>('organization')!;
        return { timeout: org.timeoutMs };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    { provide: ORGANIZATION_CLIENT, useClass: HttpOrganizationClient },
    EntityResolverRegistry,
    VisibilityCheckerService,
    VisibilityGuard,
  ],
  exports: [ORGANIZATION_CLIENT, EntityResolverRegistry, VisibilityCheckerService, VisibilityGuard],
})
export class AccessControlModule {}
