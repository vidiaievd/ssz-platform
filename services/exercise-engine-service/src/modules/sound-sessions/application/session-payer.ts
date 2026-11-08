import { Inject, Injectable, Logger } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
} from '../../../shared/application/ports/organization-client.port.js';
import {
  PRECHECK_SETTINGS_READER,
  type IPrecheckSettingsReader,
} from '../../../shared/application/ports/precheck-settings-reader.port.js';

/** Who pays could not be settled: organization-service did not answer. */
export interface PayerUnknown {
  code: 'PAYER_UNKNOWN';
  detail: string;
}

/**
 * Who pays for a pronunciation session (plan 86, step 14.1, Q32): the learner's school when its
 * learners may check with a model (`ai-precheck` switched on, as the 6g sentence drill reads
 * it), else the learner under their own plan. Settled the same way at the door and on every
 * take, so the budget shown on the start is the pool the takes draw on.
 *
 * The school is the learner's workspace as the roster has it — the one every attempt starts
 * with (`ReviewContextResolver`), probes included: a session sits in no course, so no course
 * picks the school. A school that switched its checks off is not refused here, unlike 6g: the
 * session is not the school's work, and the learner may still drill on their own plan.
 *
 * Fails rather than guessing: a school that pays must not have its learner charged because
 * organization-service blinked.
 */
@Injectable()
export class SoundSessionPayer {
  private readonly logger = new Logger(SoundSessionPayer.name);

  constructor(
    @Inject(ORGANIZATION_CLIENT) private readonly organization: IOrganizationClient,
    @Inject(PRECHECK_SETTINGS_READER) private readonly settings: IPrecheckSettingsReader,
  ) {}

  /**
   * Before the session's attempt exists: the learner's workspace as start-attempt will snapshot
   * it for a probe — no course, no content owner to prefer.
   */
  async forLearner(userId: string): Promise<Result<string | null, PayerUnknown>> {
    const context = await this.organization.resolveLearnerReviewContext(userId, {
      courseId: null,
      preferredSchoolId: null,
      preferredTeacherId: null,
    });
    if (context.isFail) return this.unknown(`workspace of ${userId}`, context.error.message);
    return this.ofSchool(context.value.schoolId);
  }

  /** The school paying for a session whose attempt snapshotted `schoolId`; null — the learner. */
  async ofSchool(schoolId: string | null): Promise<Result<string | null, PayerUnknown>> {
    if (schoolId === null) return Result.ok(null);
    try {
      const settings = await this.settings.schoolAiPrecheck(schoolId);
      return Result.ok(settings?.enabled ? schoolId : null);
    } catch (err) {
      return this.unknown(`ai-precheck of school ${schoolId}`, err instanceof Error ? err.message : String(err));
    }
  }

  private unknown(what: string, detail: string): Result<string | null, PayerUnknown> {
    this.logger.warn(`${what} unreadable: ${detail}`);
    return Result.fail({ code: 'PAYER_UNKNOWN', detail });
  }
}
