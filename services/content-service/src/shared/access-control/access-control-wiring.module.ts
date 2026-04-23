import { Global, Module } from '@nestjs/common';
import { ContentShareModule } from '../../modules/content-share/content-share.module.js';
import { EntitlementModule } from '../../modules/entitlement/entitlement.module.js';

// Breaks the circular dependency between AccessControlModule and feature modules.
// AccessControlModule (@Global) provides VisibilityCheckerService which needs
// CONTENT_SHARE_LOOKUP and ENTITLEMENT_LOOKUP. Those tokens live in feature modules
// that themselves use VisibilityCheckerService. By importing feature modules here
// (not in AccessControlModule) and re-exporting their lookup tokens as @Global,
// Nest can resolve VisibilityCheckerService's deps without a circular import graph.
//
// 'enroll' action is exposed for future use by Learning Service via internal RPC.
// No controller in Content Service uses it directly.

@Global()
@Module({
  imports: [ContentShareModule, EntitlementModule],
  // Re-export both modules so their providers (CONTENT_SHARE_LOOKUP, ENTITLEMENT_LOOKUP)
  // are visible globally — Nest resolves re-exported module tokens transitively.
  exports: [ContentShareModule, EntitlementModule],
})
export class AccessControlWiringModule {}
