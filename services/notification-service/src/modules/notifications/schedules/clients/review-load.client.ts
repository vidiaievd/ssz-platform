import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import type { AppConfig } from '../../../../config/configuration.js';
import type { PendingSubmission } from '../review-digest.composer.js';

/** A school with something waiting, as `GET /internal/attempts/review/schools` reports it. */
export interface PendingSchool {
  schoolId: string;
  pending: number;
  oldestSubmittedAt: Date;
  newestSubmittedAt: Date;
}

interface PendingSchoolsResponse {
  schools: {
    schoolId: string;
    pending: number;
    oldestSubmittedAt: string;
    newestSubmittedAt: string;
  }[];
}

interface AggregateResponse {
  pending: { containerId: string | null; groupId: string | null; submittedAt: string[] }[];
}

const TIMEOUT_MS = 10_000;

/**
 * What the exercise engine knows about work waiting on a person (plan 47.5).
 *
 * Every call here answers with `null` on failure rather than throwing. This client is
 * used by a job on a timer with nobody watching: an engine that is down for a minute must
 * cost that run's digest and nothing else — not a crashed scheduler, and above all not a
 * message claiming a queue is empty. `null` means "did not find out", which the caller
 * treats as a reason to say nothing at all.
 */
@Injectable()
export class ReviewLoadClient {
  private readonly logger = new Logger(ReviewLoadClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** Configured at all? A job with no engine address is off, not broken. */
  get configured(): boolean {
    return Boolean(this.review.exerciseServiceUrl);
  }

  async schoolsWithPendingWork(): Promise<PendingSchool[] | null> {
    const body = await this.get<PendingSchoolsResponse>('/internal/attempts/review/schools');
    if (body === null) return null;

    return body.schools.map((school) => ({
      schoolId: school.schoolId,
      pending: school.pending,
      oldestSubmittedAt: new Date(school.oldestSubmittedAt),
      newestSubmittedAt: new Date(school.newestSubmittedAt),
    }));
  }

  /**
   * Everything one school has waiting, flattened to one row per submission.
   *
   * The engine groups by course and group and hands back the times as an array, which is
   * the shape the oversight screen draws from; the digest counts per teacher, so it
   * unfolds them here rather than teaching the composer two shapes.
   */
  async pendingSubmissions(schoolId: string): Promise<PendingSubmission[] | null> {
    const body = await this.post<AggregateResponse>('/internal/attempts/review/aggregate', {
      schoolId,
    });
    if (body === null) return null;

    return body.pending.flatMap((group) =>
      group.submittedAt.map((at) => ({
        groupId: group.groupId,
        containerId: group.containerId,
        submittedAt: new Date(at),
      })),
    );
  }

  private get review(): AppConfig['review'] {
    return this.config.get<AppConfig['review']>('review')!;
  }

  private async get<T>(path: string): Promise<T | null> {
    return this.send<T>('get', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    return this.send<T>('post', path, body);
  }

  private async send<T>(method: 'get' | 'post', path: string, body?: unknown): Promise<T | null> {
    const { exerciseServiceUrl, internalToken } = this.review;
    if (!exerciseServiceUrl) return null;

    // The engine serves everything behind `api/v1`, internal routes included — a caller
    // that forgets it gets a 404 that reads exactly like "nothing is waiting".
    const url = `${exerciseServiceUrl}/api/v1${path}`;
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
