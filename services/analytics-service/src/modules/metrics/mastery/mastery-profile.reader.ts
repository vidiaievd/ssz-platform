import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { weakestCells } from '@ssz/shared-kernel/mastery';
import type { CellProfile, WeakestCells } from '@ssz/shared-kernel/mastery';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

export interface MasteryProfile extends WeakestCells {
  userId: string;
  courseId: string | null;
  /**
   * Reported so a caller can tell "nothing is weak" from "nothing cleared the bar", and so
   * the number a verdict was made under is visible where the verdict is.
   */
  minWeightedSample: number;
}

/**
 * One learner's skill profile, judged — plan 55 §5.2.
 *
 * Shared by the internal route (a named learner, for the drill picker and the teacher's
 * view) and the learner's own (`analytics/mastery/me`), so the two can never disagree on
 * what is weak.
 */
@Injectable()
export class MasteryProfileReader {
  private readonly minWeightedSample: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService<AppConfig>,
  ) {
    this.minWeightedSample = config.get<AppConfig['mastery']>('mastery')?.minWeightedSample ?? 8;
  }

  /**
   * `courseId` omitted means every cell the learner has, course or not. A `limit` that is
   * not a positive integer is ignored rather than refused — the list is simply not cut.
   */
  async read(userId: string, courseId?: string, limit?: string): Promise<MasteryProfile> {
    const rows = await this.prisma.skillMastery.findMany({
      where: { userId, ...(courseId === undefined ? {} : { courseId }) },
    });

    const profile: CellProfile[] = rows.map((row) => ({
      skill: row.skill as CellProfile['skill'],
      focus: row.focus as CellProfile['focus'],
      state: {
        successRateEwma: row.successRateEwma,
        meanStability: row.meanStability,
        medianSecondsPerItem: row.medianSecondsPerItem,
        attempts: row.attempts,
        weightedSample: row.weightedSample,
        lastAttemptAt: row.lastAttemptAt,
      },
    }));

    const parsedLimit = limit === undefined ? undefined : Number.parseInt(limit, 10);
    const result = weakestCells(profile, {
      minWeightedSample: this.minWeightedSample,
      ...(parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? { limit: parsedLimit }
        : {}),
    });

    return {
      userId,
      courseId: courseId ?? null,
      minWeightedSample: this.minWeightedSample,
      ...result,
    };
  }
}
