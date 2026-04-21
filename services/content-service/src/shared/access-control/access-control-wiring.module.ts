import { Global, Module } from '@nestjs/common';
import { ContentShareModule } from '../../modules/content-share/content-share.module.js';
import { ENTITLEMENT_LOOKUP } from './domain/ports/entitlement-lookup.port.js';

// Breaks the circular dependency between AccessControlModule and feature modules.
// AccessControlModule (@Global) provides VisibilityCheckerService which needs
// CONTENT_SHARE_LOOKUP and ENTITLEMENT_LOOKUP. Those tokens live in feature modules
// that themselves use VisibilityCheckerService. By importing feature modules here
// (not in AccessControlModule) and re-exporting their lookup tokens as @Global,
// Nest can resolve VisibilityCheckerService's deps without a circular import graph.
//
// TODO(step-6): add EntitlementModule import and replace ENTITLEMENT_LOOKUP stub
//               once EntitlementModule is implemented.

@Global()
@Module({
  imports: [ContentShareModule],
  providers: [
    {
      provide: ENTITLEMENT_LOOKUP,
      useValue: { hasActiveEntitlement: () => Promise.resolve(false) },
    },
  ],
  // Re-export ContentShareModule so its providers (including CONTENT_SHARE_LOOKUP) are
  // visible globally — Nest resolves re-exported module tokens transitively.
  exports: [ContentShareModule, ENTITLEMENT_LOOKUP],
})
export class AccessControlWiringModule {}
