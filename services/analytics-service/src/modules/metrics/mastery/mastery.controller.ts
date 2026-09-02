import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { weakestCells } from '@ssz/shared-kernel/mastery';
import type { CellProfile } from '@ssz/shared-kernel/mastery';
import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

/**
 * What this learner is weak at — plan 55 §5.2.
 *
 * Internal only: the first consumer is the drill picker (plan 40), which needs a cell to
 * aim generated practice at, and the second is the teacher's view (phase 6), which reaches
 * it through its own service. `@Public()` takes it out of the JWT guard's hands and
 * `InternalAuthGuard` takes over — this answers about a named learner, so it is guarded
 * rather than left to the network like the event replay is.
 *
 * The answer has two lists and they are not interchangeable. `weakest` is what may be acted
 * on. `insufficient` is what the profile refuses to judge, and it is the more useful half
 * today: a cell with no evidence usually means the course contains none of that, which is
 * the coverage report's finding arriving from the learner's side (§3.10).
 */
@ApiExcludeController()
@Controller('internal/mastery')
@Public()
@UseGuards(InternalAuthGuard)
export class MasteryController {
  private readonly minWeightedSample: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService<AppConfig>,
  ) {
    this.minWeightedSample = config.get<AppConfig['mastery']>('mastery')?.minWeightedSample ?? 8;
  }

  @Get(':userId')
  async forUser(
    @Param('userId') userId: string,
    /** Narrow to one course. Omitted means every cell the learner has, course or not. */
    @Query('courseId') courseId?: string,
    @Query('limit') limit?: string,
  ) {
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
      // Reported so a caller can tell "nothing is weak" from "nothing cleared the bar",
      // and so the number a verdict was made under is visible where the verdict is.
      minWeightedSample: this.minWeightedSample,
      ...result,
    };
  }
}
