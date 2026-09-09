import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetContainerReviewSettingsQuery } from './get-container-review-settings.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  ORGANIZATION_CLIENT,
  type IOrganizationClient,
} from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '../../../../../shared/application/ports/cache.port.js';

export interface ContainerReviewSettingsResult {
  /** What actually applies — the override if there is one, otherwise the school's. */
  respondWithinHours: number | null;
  /** The school's promise, always reported so a screen can show what "inherit" means. */
  inheritedHours: number | null;
  overridden: boolean;
}

/** A minute. Long enough to spare org-service a call per course read, short enough that
 *  a school that just changed its promise sees it take effect while still on the page. */
const SCHOOL_PROMISE_TTL_SECONDS = 60;

const cacheKey = (schoolId: string) => `content:school-review-settings:${schoolId}`;

/**
 * The course's promise and the one behind it.
 *
 * Both are always reported, which is the whole point of criterion 35: an author looking
 * at "inherited: 48 h" and deciding whether to override needs to see the number they
 * would be departing from, and a response that returned only the effective value would
 * make "inherit" and "happens to agree" indistinguishable.
 *
 * A course outside a school, or one whose school cannot be reached, inherits nothing and
 * says so with nulls rather than inventing the platform default — a promise nobody made
 * is not a promise to display.
 */
@QueryHandler(GetContainerReviewSettingsQuery)
export class GetContainerReviewSettingsHandler
  implements IQueryHandler<GetContainerReviewSettingsQuery>
{
  private readonly logger = new Logger(GetContainerReviewSettingsHandler.name);

  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly organization: IOrganizationClient,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async execute(
    query: GetContainerReviewSettingsQuery,
  ): Promise<Result<ContainerReviewSettingsResult, ContainerDomainError>> {
    const container = await this.containers.findById(query.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const inheritedHours = container.ownerSchoolId
      ? await this.schoolPromise(container.ownerSchoolId)
      : null;

    const override = container.reviewRespondWithinHours;
    return Result.ok({
      respondWithinHours: override ?? inheritedHours,
      inheritedHours,
      overridden: override !== null,
    });
  }

  /**
   * The school's promise, cached for a minute.
   *
   * A school that cannot be reached is reported as no inherited promise rather than as an
   * error: this route's subject is the course's own setting, and an author must still be
   * able to read and change it while a neighbour is down.
   */
  private async schoolPromise(schoolId: string): Promise<number | null> {
    const key = cacheKey(schoolId);
    const cached = await this.cache.get<number>(key);
    if (cached !== null) return cached;

    try {
      const settings = await this.organization.getSchoolReviewSettings(schoolId);
      if (settings === null) return null;

      await this.cache.set(key, settings.respondWithinHours, SCHOOL_PROMISE_TTL_SECONDS);
      return settings.respondWithinHours;
    } catch (error) {
      this.logger.warn(
        `Could not read the review promise of school ${schoolId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
