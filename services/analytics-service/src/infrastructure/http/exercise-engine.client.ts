import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

/** What is still waiting for a person in one school, and since when (plan 44 §44.11). */
export interface PendingReviewLoad {
  pending: number;
  oldestSubmittedAt: Date | null;
}

interface AggregateResponse {
  pending?: Array<{ submittedAt?: string[] }>;
}

/**
 * The one thing analytics asks the exercise engine.
 *
 * Since plan 44 the engine's `attempts` table is the only record of work waiting for a
 * teacher, so the "pending reviews" figure has to be asked for rather than projected. A
 * projection would be a second copy of the same facts that is wrong for a second every
 * time a teacher closes something — and the dashboard would then disagree with the queue
 * the teacher is looking at (§0.1).
 */
@Injectable()
export class ExerciseEngineClient {
  private readonly logger = new Logger(ExerciseEngineClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const engine = this.config.get<AppConfig['exerciseEngine']>('exerciseEngine');
    this.baseUrl = engine?.baseUrl ?? 'http://exercise-engine-service:3006';
    this.token = engine?.token ?? 'internal-dev-token';
  }

  /**
   * Best-effort: a dashboard tile is not worth failing a whole page for. When the engine
   * is unreachable the caller gets `null` and draws the tile as unavailable rather than
   * as a confident zero, which would read as "nothing to mark".
   */
  async getPendingReviewLoad(schoolId: string): Promise<PendingReviewLoad | null> {
    try {
      // The engine mounts everything under a global `/api/v1` prefix, internal routes
      // included.
      const res = await fetch(`${this.baseUrl}/api/v1/internal/attempts/review/aggregate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ schoolId, periodDays: 1 }),
      });

      if (!res.ok) {
        this.logger.warn(`Review aggregate failed for school ${schoolId}: ${res.status}`);
        return null;
      }

      const body = (await res.json()) as AggregateResponse;
      const submittedAt = (body.pending ?? []).flatMap((group) => group.submittedAt ?? []);

      // The engine reports every waiting submission's time rather than a count, because
      // the oversight screen draws their spread. Here only the size and the eldest matter.
      let oldest: Date | null = null;
      for (const iso of submittedAt) {
        const at = new Date(iso);
        if (Number.isNaN(at.getTime())) continue;
        if (oldest === null || at < oldest) oldest = at;
      }

      return { pending: submittedAt.length, oldestSubmittedAt: oldest };
    } catch (error) {
      this.logger.warn(
        `Review aggregate unreachable for school ${schoolId}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
