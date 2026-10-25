import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetContainerReviewAiPolicyQuery } from './get-container-review-ai-policy.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
  type SchoolReviewAiPolicy,
} from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '../../../../../shared/application/ports/cache.port.js';

export interface ContainerReviewAiPolicyResult {
  /**
   * When a model's verdict on this course's work counts by itself — the course's own term
   * if it has one, raised to the school's escalation; otherwise the school's term. Null
   * when there is no school to inherit from (or it cannot be reached).
   */
  autoAcceptAfterHours: number | null;
  /** The school's term — what "inherit" means for this course. */
  inheritedAutoAcceptAfterHours: number | null;
  overridden: boolean;
  /**
   * The school's escalation: a course term below it is raised to it, so the administrator
   * hears of unanswered work before the model's verdict counts (plan 80, Q2-A).
   */
  escalationFloorHours: number | null;
  /** Templates whose work always goes to a teacher when the school samples (plan 80, Q4). */
  teacherReviewTemplates: string[];
  /** The school's mode and share, so one read tells exercise-engine everything. */
  schoolMode: SchoolReviewAiPolicy['mode'] | null;
  samplePercent: number | null;
  /**
   * The school the course belongs to — the one whose policy this is. exercise-engine applies
   * it only to work handed in at that school; elsewhere the learner's own school decides.
   */
  ownerSchoolId: string | null;
}

interface SchoolTerms {
  policy: SchoolReviewAiPolicy;
  escalateAfterHours: number;
}

/** A minute, as the response promise next door. */
const SCHOOL_TERMS_TTL_SECONDS = 60;

const cacheKey = (schoolId: string) => `content:school-review-ai-policy:${schoolId}`;

/**
 * The course's review policy and the school's behind it.
 *
 * The raise to the escalation is applied here, on read, rather than refused on write:
 * the escalation is the school's and can move after the course saved its term, and a
 * cross-service check at write time would be stale the moment it passed.
 */
@QueryHandler(GetContainerReviewAiPolicyQuery)
export class GetContainerReviewAiPolicyHandler
  implements IQueryHandler<GetContainerReviewAiPolicyQuery>
{
  private readonly logger = new Logger(GetContainerReviewAiPolicyHandler.name);

  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly organization: IOrganizationClient,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async execute(
    query: GetContainerReviewAiPolicyQuery,
  ): Promise<Result<ContainerReviewAiPolicyResult, ContainerDomainError>> {
    const container = await this.containers.findById(query.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const school = container.ownerSchoolId ? await this.schoolTerms(container.ownerSchoolId) : null;
    const override = container.reviewAutoAcceptAfterHours;
    const floor = school?.escalateAfterHours ?? null;
    const inherited = school?.policy.autoAcceptAfterHours ?? null;

    return Result.ok({
      autoAcceptAfterHours: override !== null ? Math.max(override, floor ?? override) : inherited,
      inheritedAutoAcceptAfterHours: inherited,
      overridden: override !== null,
      escalationFloorHours: floor,
      teacherReviewTemplates: container.reviewTeacherTemplates,
      schoolMode: school?.policy.mode ?? null,
      samplePercent: school?.policy.samplePercent ?? null,
      ownerSchoolId: container.ownerSchoolId ?? null,
    });
  }

  /**
   * The school's policy and escalation, cached for a minute. A school that cannot be
   * reached reads as none, as for the response promise: the course's own settings must
   * stay readable while a neighbour is down.
   */
  private async schoolTerms(schoolId: string): Promise<SchoolTerms | null> {
    const key = cacheKey(schoolId);
    const cached = await this.cache.get<SchoolTerms>(key);
    if (cached !== null) return cached;

    try {
      const [policy, settings] = await Promise.all([
        this.organization.getSchoolReviewAiPolicy(schoolId),
        this.organization.getSchoolReviewSettings(schoolId),
      ]);
      if (policy === null || settings === null) return null;

      const terms = { policy, escalateAfterHours: settings.escalateAfterHours };
      await this.cache.set(key, terms, SCHOOL_TERMS_TTL_SECONDS);
      return terms;
    } catch (error) {
      this.logger.warn(
        `Could not read the review policy of school ${schoolId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
