import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

/** One teachable item of a unit, as content-service orders them. */
export interface OutlineItem {
  id: string;
  itemType: string;
  position: number;
}

export interface OutlineUnit {
  id: string;
  title: string | null;
  /** Position among the course's units, counted across levels, starting at 1. */
  order: number;
  items: OutlineItem[];
}

/**
 * What a published course actually trains, as the coverage report counts it.
 *
 * `bySkill` and `byFocus` are margins of the same table, not the table itself: a pair may
 * be empty while both of its margins are not. The caller may therefore conclude "this
 * course teaches none of that" from a zero margin, and must not conclude the opposite
 * from a non-zero one.
 */
export interface CourseCoverage {
  containerId: string;
  /** False when nothing is published — not a course of zeroes, a course with no version. */
  available: boolean;
  total: number;
  bySkill: Record<string, number>;
  byFocus: Record<string, number>;
  emptySkills: string[];
}

export interface CourseOutline {
  containerId: string;
  /** `null` when nothing is published — a legal state, not a failure. */
  versionId: string | null;
  units: OutlineUnit[];
}

/**
 * The published shape of a course, asked of the service that owns it.
 *
 * Analytics needs it to answer anything about a *unit*: every number this service holds
 * is per item or per attempt, and "how much of unit 4 landed" has no meaning until items
 * are grouped. The grouping is a fact about the published version — content-service
 * already computes it for the scheduler (`internal/containers/:id/outline`), and a second
 * derivation here would eventually disagree with the course a student is looking at.
 *
 * Best-effort, like the engine client beside it: unreachable answers `null`, and the
 * caller keeps the outline it already had rather than deleting a course's units because
 * a request timed out.
 */
@Injectable()
export class ContentClient {
  private readonly logger = new Logger(ContentClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const content = this.config.get<AppConfig['content']>('content');
    this.baseUrl = content?.baseUrl ?? 'http://content-service:3003';
    this.token = content?.token ?? 'internal-dev-token';
  }

  async getCourseOutline(containerId: string): Promise<CourseOutline | null> {
    try {
      // content-service mounts everything under a global `/api/v1`, internal routes
      // included — a call without it 404s silently.
      const res = await fetch(`${this.baseUrl}/api/v1/internal/containers/${containerId}/outline`, {
        headers: { 'x-internal-token': this.token },
      });

      if (!res.ok) {
        this.logger.warn(`Outline for container ${containerId} failed: ${res.status}`);
        return null;
      }

      return (await res.json()) as CourseOutline;
    } catch (error) {
      this.logger.warn(
        `Outline for container ${containerId} unreachable: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * What the published course trains, so that "the learner has not done this" can be
   * told from "the course contains none of it" (plan 58, phase 4).
   *
   * `null` when content could not be asked, and the caller then leaves the question open
   * rather than answering `noContent`: blaming the course for a request that timed out
   * is the same class of lie as a zero.
   */
  async getCoverage(containerId: string): Promise<CourseCoverage | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/internal/containers/${containerId}/coverage`,
        { headers: { 'x-internal-token': this.token } },
      );

      if (!res.ok) {
        this.logger.warn(`Coverage for container ${containerId} failed: ${res.status}`);
        return null;
      }

      return (await res.json()) as CourseCoverage;
    } catch (error) {
      this.logger.warn(
        `Coverage for container ${containerId} unreachable: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
