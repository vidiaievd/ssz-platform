import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
  type SchoolLifecycleStatus,
} from '../../../../shared/application/ports/organization-client.port.js';

const CACHE_MS = 30_000;

/**
 * A school that is not `active` is read only (plan 90, phase 5, step 7): `suspended` for 30 days,
 * then `closed`, then `purged`. New attempts on its courses, their hand-in, its staff's review and
 * the pre-hand-in rehearsal are refused with 409 `SCHOOL_NOT_ACTIVE { schoolStatus }`; the
 * learner's history and reading are untouched.
 *
 * Which school: for a learner's work, the one that **owns the exercise's course** — a learner of a
 * suspended school keeps working on a public course of their own. For a school's staff acting on
 * a submission, the attempt's own school.
 *
 * Fails open: a neighbour that does not answer must not stop a learner (as everywhere around
 * starting an attempt). Answers are kept {@link CACHE_MS} ms — status changes are rare and these
 * checks sit on the hot path of every start and hand-in.
 */
@Injectable()
export class SchoolActivityGate {
  private readonly logger = new Logger(SchoolActivityGate.name);
  private readonly statuses = new Map<string, { status: SchoolLifecycleStatus; at: number }>();
  private readonly owners = new Map<string, { schoolId: string | null; at: number }>();

  constructor(
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
    @Inject(ORGANIZATION_CLIENT) private readonly organization: IOrganizationClient,
  ) {}

  /** A learner starts, hands in or rehearses work on this exercise. */
  async assertExerciseOpen(exerciseId: string): Promise<void> {
    await this.assertSchoolOpen(await this.ownerSchoolOf(exerciseId));
  }

  /** Throws 409 unless the school is active; a null school (no workspace) always passes. */
  async assertSchoolOpen(schoolId: string | null): Promise<void> {
    if (!schoolId) return;
    const status = await this.statusOf(schoolId);
    if (status === 'active') return;
    throw new ConflictException({
      code: 'SCHOOL_NOT_ACTIVE',
      message: `The school is ${status}: its work is read only`,
      schoolStatus: status,
    });
  }

  private async ownerSchoolOf(exerciseId: string): Promise<string | null> {
    const hit = this.owners.get(exerciseId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.schoolId;
    const placement = await this.content.getExercisePlacement(exerciseId);
    if (placement.isOk) {
      this.owners.set(exerciseId, { schoolId: placement.value.ownerSchoolId, at: Date.now() });
      return placement.value.ownerSchoolId;
    }
    // 404 = in no course (a probe): nobody's school. Anything else = unknown, so let it through.
    if (placement.error.statusCode === 404) return null;
    this.logger.warn(`Placement of exercise ${exerciseId} unreadable: ${placement.error.message}; not checking the school`);
    return null;
  }

  private async statusOf(schoolId: string): Promise<SchoolLifecycleStatus> {
    const hit = this.statuses.get(schoolId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.status;
    const result = await this.organization.getSchoolStatus(schoolId);
    if (result.isOk) {
      this.statuses.set(schoolId, { status: result.value, at: Date.now() });
      return result.value;
    }
    if (result.error.statusCode !== 404) {
      this.logger.warn(`Status of school ${schoolId} unreadable: ${result.error.message}; treating it as active`);
    }
    return 'active';
  }
}
