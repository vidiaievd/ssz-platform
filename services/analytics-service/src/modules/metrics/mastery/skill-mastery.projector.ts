import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AttemptRatedPayload } from '@ssz/contracts';
import { cellsFor, evidenceWeight, foldAttempt, succeededAt } from '@ssz/shared-kernel/mastery';
import type { MasteryObservation } from '@ssz/shared-kernel/mastery';
import type { Focus, Skill } from '@ssz/shared-kernel/skills';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

/**
 * The learner's profile, folded one attempt at a time — plan 55 §5.1.
 *
 * Every judgement here is imported, not made: which cells an attempt belongs to, how much
 * it is worth, and how a cell absorbs it all live in `@ssz/shared-kernel/mastery`, which is
 * pure and tested. What is left in this class is reading the row, calling the fold, and
 * writing it back — deliberately, because the arithmetic is the part that has to be argued
 * about and the database round trip is not.
 *
 * Runs inside the `attempt_evidence` consumer's idempotency guard: a redelivered event is
 * skipped before it reaches here, which matters far more for a running average than for an
 * append-only record. Counting the same attempt twice does not duplicate a row, it moves
 * the profile.
 */
@Injectable()
export class SkillMasteryProjector {
  private readonly logger = new Logger(SkillMasteryProjector.name);
  private readonly alpha: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig>,
  ) {
    this.alpha = config.get<AppConfig['mastery']>('mastery')?.ewmaAlpha ?? 0.2;
  }

  async apply(p: AttemptRatedPayload, occurredAt: string): Promise<void> {
    // `null` on both axes is a publisher that never spoke — every event from before the
    // axes existed. That is not the same as an empty derivation, which lands in the
    // `unknown` bucket and is a finding; this is an absence of information, and folding it
    // in under any label would invent one.
    if (p.skills === null && p.focus === null) return;

    const succeeded = succeededAt(p.ratingApplied);
    const weight = evidenceWeight({
      succeeded,
      answerForm: p.answerForm,
      templateCode: p.templateCode,
      gapPosition: p.gapPosition,
    });

    const observation: MasteryObservation = {
      succeeded,
      weight,
      stability: p.stabilityAfter,
      secondsPerItem: secondsPerItem(p),
      at: new Date(occurredAt),
    };

    const cells = cellsFor((p.skills ?? []) as Skill[], (p.focus ?? []) as Focus[]);

    for (const cell of cells) {
      // Counted in full in every cell it touches rather than split between them: an
      // exercise that is reading *and* grammar is evidence about both, not half of each.
      await this.fold(p.userId, p.containerId, cell.skill, cell.focus, observation);
    }
  }

  private async fold(
    userId: string,
    courseId: string | null,
    skill: string,
    focus: string,
    observation: MasteryObservation,
  ): Promise<void> {
    // `findFirst` rather than an upsert on the compound key: `courseId` is nullable, and
    // Prisma will not take a null inside a compound unique lookup. The uniqueness is still
    // enforced by the index (NULLS NOT DISTINCT, see the migration); this consumer is the
    // only writer, and it is single-threaded per message.
    const existing = await this.prisma.skillMastery.findFirst({
      where: { userId, courseId, skill, focus },
    });

    const next = foldAttempt(
      existing === null
        ? null
        : {
            successRateEwma: existing.successRateEwma,
            meanStability: existing.meanStability,
            medianSecondsPerItem: existing.medianSecondsPerItem,
            attempts: existing.attempts,
            weightedSample: existing.weightedSample,
            lastAttemptAt: existing.lastAttemptAt,
          },
      observation,
      { alpha: this.alpha },
    );

    if (existing === null) {
      await this.prisma.skillMastery.create({
        data: { userId, courseId, skill, focus, ...next },
      });
      return;
    }

    await this.prisma.skillMastery.update({ where: { id: existing.id }, data: next });
  }
}

/**
 * How long the learner spent on one item of this attempt.
 *
 * `gapCount` when the attempt was graded gap by gap — the same event is published once per
 * gap, so dividing gives each gap its share rather than charging every one of them with the
 * whole exercise. One item otherwise, which is what a single-answer template is.
 *
 * An approximation, and knowingly so: the learner did not spend the time evenly. It is
 * enough to answer "is this getting faster", which is the only question the metric is asked.
 */
function secondsPerItem(p: AttemptRatedPayload): number | null {
  if (p.timeSpentSeconds === null || p.timeSpentSeconds < 0) return null;
  const items = p.gapCount !== null && p.gapCount > 0 ? p.gapCount : 1;
  return p.timeSpentSeconds / items;
}
