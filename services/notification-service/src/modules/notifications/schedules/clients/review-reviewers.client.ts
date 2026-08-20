import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import type { AppConfig } from '../../../../config/configuration.js';
import type { ReviewerGroup } from '../review-digest.composer.js';

/** The school's promise and its patience, as organization-service holds them (44.12). */
export interface SchoolReviewSettings {
  respondWithinHours: number;
  escalateAfterHours: number;
  escalateTo: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Who reviews whose work, and what the school promised about it (plan 47.5).
 *
 * The digest never derives either for itself. `reviewers(sub)` is one rule with one home
 * (44 §0.2) — a copy of it in a cron job would drift the first time a substitution is
 * added — and how long is too long is a thing a school decided, not a platform constant.
 *
 * Failures answer `null`, for the same reason as the load client: a run that cannot find
 * out who to write to writes to nobody.
 */
@Injectable()
export class ReviewReviewersClient {
  private readonly logger = new Logger(ReviewReviewersClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  get configured(): boolean {
    return Boolean(this.review.organizationServiceUrl);
  }

  /**
   * The teachers of each group, as of now.
   *
   * `at` is left to the service's default deliberately: the question here is who should
   * pick the work up today, not who was assigned when it was handed in. A teacher whose
   * substitution has ended should stop being told about a queue they can no longer open.
   */
  async reviewersOf(groupIds: string[]): Promise<ReviewerGroup[] | null> {
    if (groupIds.length === 0) return [];

    const body = await this.send<{ groups: ReviewerGroup[] }>(
      'post',
      '/internal/review/reviewers',
      { groupIds },
    );
    return body === null ? null : body.groups;
  }

  /**
   * Who the school wants told when nobody answered in time (44.12, plan 47.5/47.6).
   *
   * The groups travel with the question because one of the three targets — the group's
   * primary teacher — has no school-wide answer. Which target it is stays organization's
   * to decide: this job states the situation, never the policy.
   */
  async escalationRecipientsOf(
    schoolId: string,
    groupIds: string[],
  ): Promise<{ target: string; recipients: { userId: string; name: string }[] } | null> {
    return this.send('post', '/internal/review/escalation-recipients', { schoolId, groupIds });
  }

  async settingsOf(schoolId: string): Promise<SchoolReviewSettings | null> {
    return this.send<SchoolReviewSettings>(
      'get',
      `/internal/schools/${schoolId}/review-settings`,
    );
  }

  private get review(): AppConfig['review'] {
    return this.config.get<AppConfig['review']>('review')!;
  }

  private async send<T>(method: 'get' | 'post', path: string, body?: unknown): Promise<T | null> {
    const { organizationServiceUrl, internalToken } = this.review;
    if (!organizationServiceUrl) return null;

    const url = `${organizationServiceUrl}/api/v1${path}`;
    // Internal routes are gated by `x-internal-token`, never by a borrowed Bearer token —
    // sending the wrong one earns a 401 that looks like "no such school".
    const options = { headers: { 'x-internal-token': internalToken ?? '' } };

    try {
      const request =
        method === 'get'
          ? this.http.get<T>(url, options)
          : this.http.post<T>(url, body ?? {}, options);
      const response = await firstValueFrom(request.pipe(timeout(TIMEOUT_MS)));
      return response.data;
    } catch (err) {
      this.logger.warn(`${method.toUpperCase()} ${path} failed: ${String(err)}`);
      return null;
    }
  }
}
