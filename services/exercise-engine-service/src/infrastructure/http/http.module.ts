import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CONTENT_CLIENT } from '../../shared/application/ports/content-client.port.js';
import { ORGANIZATION_CLIENT } from '../../shared/application/ports/organization-client.port.js';
import { MEDIA_ASSETS } from '../../shared/application/ports/media-assets.port.js';
import {
  ENTITLEMENT_LIMITS_CLIENT,
  ENTITLEMENTS_CLIENT,
} from '../../shared/application/ports/entitlements-client.port.js';
import { REVIEW_POLICY_READER } from '../../shared/application/ports/review-policy-reader.port.js';
import { PRECHECK_SETTINGS_READER } from '../../shared/application/ports/precheck-settings-reader.port.js';
import { AI_PRECHECK_CLIENT } from '../../shared/application/ports/ai-precheck-client.port.js';
import { HttpContentClient } from './http-content-client.js';
import { HttpOrganizationClient } from './http-organization-client.js';
import { HttpMediaAssetsClient } from './http-media-assets-client.js';
import { HttpEntitlementsClient } from './http-entitlements-client.js';
import { HttpReviewPolicyReader } from './http-review-policy-reader.js';
import { HttpPrecheckSettingsReader } from './http-precheck-settings-reader.js';
import { HttpAiPrecheckClient } from './http-ai-precheck-client.js';
import { ExerciseDefinitionCache } from '../cache/exercise-definition-cache.js';
import { ExercisePlacementCache } from '../cache/exercise-placement-cache.js';
import { CachedContentClient } from '../cache/cached-content-client.js';
import { ProbesModule } from '../../modules/probes/probes.module.js';
import { PROBE_TASK_REPOSITORY } from '../../modules/probes/domain/repositories/probe-task.repository.js';
import type { IProbeTaskRepository } from '../../modules/probes/domain/repositories/probe-task.repository.js';
import { ProbeAwareContentClient } from '../../modules/probes/infrastructure/content/probe-aware-content-client.js';

@Global()
@Module({
  imports: [HttpModule, ProbesModule],
  providers: [
    // Raw HTTP client — internal dependency of CachedContentClient, not exported directly.
    HttpContentClient,
    ExerciseDefinitionCache,
    ExercisePlacementCache,
    CachedContentClient,
    /*
      The content port answers about two spaces, and this is where that is decided
      (plan 63 phase 9, step 2).

      The decorator is bound here rather than in the probes module because `CONTENT_CLIENT`
      is bound here: a second binding elsewhere would give half the application a client
      that knows about probes and half one that does not, depending on which module
      resolved the token — and the half that did not would be the half that runs attempts.

      The layering reads backwards (infrastructure importing a feature module) and is the
      right way round in practice: probes are a *source of definitions*, and the alternative
      is a flag on this client plus a table lookup it has no business knowing about.
    */
    {
      provide: CONTENT_CLIENT,
      inject: [CachedContentClient, PROBE_TASK_REPOSITORY],
      useFactory: (catalogue: CachedContentClient, probes: IProbeTaskRepository) =>
        new ProbeAwareContentClient(catalogue, probes),
    },

    HttpOrganizationClient,
    { provide: ORGANIZATION_CLIENT, useExisting: HttpOrganizationClient },

    HttpMediaAssetsClient,
    { provide: MEDIA_ASSETS, useExisting: HttpMediaAssetsClient },

    HttpEntitlementsClient,
    { provide: ENTITLEMENTS_CLIENT, useExisting: HttpEntitlementsClient },
    { provide: ENTITLEMENT_LIMITS_CLIENT, useExisting: HttpEntitlementsClient },

    HttpReviewPolicyReader,
    { provide: REVIEW_POLICY_READER, useExisting: HttpReviewPolicyReader },

    // Plan 84, step 5: the check before hand-in.
    HttpPrecheckSettingsReader,
    { provide: PRECHECK_SETTINGS_READER, useExisting: HttpPrecheckSettingsReader },
    HttpAiPrecheckClient,
    { provide: AI_PRECHECK_CLIENT, useExisting: HttpAiPrecheckClient },
  ],
  exports: [
    CONTENT_CLIENT,
    ORGANIZATION_CLIENT,
    MEDIA_ASSETS,
    ENTITLEMENTS_CLIENT,
    ENTITLEMENT_LIMITS_CLIENT,
    REVIEW_POLICY_READER,
    PRECHECK_SETTINGS_READER,
    AI_PRECHECK_CLIENT,
    // Exported so the events consumer (Step 19) can call invalidate() on exercise delete.
    ExerciseDefinitionCache,
  ],
})
export class HttpClientsModule {}
