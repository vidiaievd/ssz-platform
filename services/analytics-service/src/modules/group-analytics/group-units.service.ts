import { Injectable } from '@nestjs/common';
import { evidenceWeight, succeededAt } from '@ssz/shared-kernel/mastery';
import type { ReviewRatingValue } from '@ssz/shared-kernel/evidence';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CourseOutlineService } from '../projections/course-outline.service.js';

/** One unit of the published course, with the items the numbers are counted over. */
export interface CourseUnit {
  unitId: string;
  /** Position in the course, from 1 — what the chart's x axis is labelled with. */
  no: number;
  title: string;
  itemIds: string[];
  items: number;
}

/** What one learner did with one unit, counted from their item states. */
export interface LearnerAbsorbed {
  passed: number;
  /** Has this learner touched the unit at all. `false` is `notStarted`, never `0%`. */
  touched: boolean;
}

/** What one learner's attempts on one unit proved, in the profile's own currency. */
export interface LearnerEvidence {
  attempts: number;
  weightedSample: number;
  /** Weight that went to successes — the numerator of the unit's quality. */
  successWeight: number;
}

export interface UnitEvidence {
  byLearner: Map<string, LearnerEvidence>;
  attempts: number;
  weightedSample: number;
  successWeight: number;
}

/**
 * Everything the group surfaces read about a course's units — plan 58, phases 2 and 3.
 *
 * One service rather than a helper per endpoint because the progress chart and the
 * heatmap under it print the same learner's same unit, and the plan's rule is that they
 * may never disagree about it (§3 phase 3). Two handlers computing "how much of unit 4
 * did Anna take" from the same tables would disagree the first time one of them changed
 * what counts as passed.
 */
@Injectable()
export class GroupUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outline: CourseOutlineService,
  ) {}

  /**
   * The course's units, freshening the outline if this is the first time anyone asked.
   *
   * Empty is a real answer — a course with nothing published has no units — and it is
   * distinguishable from "we never looked", which is what `ensureFresh` is for.
   */
  async unitsOf(containerId: string): Promise<CourseUnit[]> {
    await this.outline.ensureFresh(containerId);

    const rows = await this.prisma.courseOutlineItem.findMany({
      where: { containerId },
      orderBy: [{ unitOrder: 'asc' }, { position: 'asc' }],
      select: { unitId: true, unitOrder: true, unitTitle: true, itemId: true },
    });

    const units = new Map<string, CourseUnit>();
    for (const row of rows) {
      let unit = units.get(row.unitId);
      if (unit === undefined) {
        unit = {
          unitId: row.unitId,
          no: row.unitOrder,
          title: row.unitTitle ?? `Unit ${row.unitOrder}`,
          itemIds: [],
          items: 0,
        };
        units.set(row.unitId, unit);
      }
      unit.itemIds.push(row.itemId);
      unit.items += 1;
    }

    return [...units.values()];
  }

  /**
   * `passedItems / unit.items` per learner, per unit — the `absorbed` of DATA_MODEL §1.
   *
   * Read off `item_progress`, not off attempts: a unit is made of lessons and word lists
   * as well as exercises, and the denominator is the unit's items, so the numerator has
   * to be able to speak about every one of them. `NEEDS_REVIEW` is not passed — the work
   * is sitting with a teacher, and the learner has not taken anything away from it yet.
   *
   * A learner with no row at all is absent from the map, not present with `0`.
   */
  async absorbedByUnit(
    userIds: readonly string[],
    units: readonly CourseUnit[],
  ): Promise<Map<string, Map<string, LearnerAbsorbed>>> {
    const byUnit = new Map<string, Map<string, LearnerAbsorbed>>();
    for (const unit of units) byUnit.set(unit.unitId, new Map());
    if (userIds.length === 0 || units.length === 0) return byUnit;

    const unitOfItem = new Map<string, string>();
    for (const unit of units) for (const itemId of unit.itemIds) unitOfItem.set(itemId, unit.unitId);

    const rows = await this.prisma.itemProgress.findMany({
      where: { userId: { in: [...userIds] }, contentId: { in: [...unitOfItem.keys()] } },
      select: { userId: true, contentId: true, status: true },
    });

    for (const row of rows) {
      const unitId = unitOfItem.get(row.contentId);
      if (unitId === undefined) continue;
      const learners = byUnit.get(unitId);
      if (learners === undefined) continue;

      const cell = learners.get(row.userId) ?? { passed: 0, touched: false };
      // `NOT_STARTED` is a row the learning service writes when a card is created, so it
      // is not evidence that anybody opened anything.
      if (row.status !== 'NOT_STARTED') cell.touched = true;
      if (row.status === 'COMPLETED') cell.passed += 1;
      learners.set(row.userId, cell);
    }

    return byUnit;
  }

  /**
   * What the group's attempts on each unit proved, weighted as the mastery profile
   * weights them (plan 58 §2 A).
   *
   * The `quality` axis is deliberately not read off `skill_mastery`: that table has no
   * unit axis at all — its rows are (learner × course × skill × focus) — so "how well did
   * unit 4 go" cannot be asked of it. It is asked of the attempts instead, with the same
   * evidence weights, so that a word picked out of two still counts for less here than a
   * word typed from memory.
   */
  async evidenceByUnit(
    userIds: readonly string[],
    units: readonly CourseUnit[],
  ): Promise<Map<string, UnitEvidence>> {
    const byUnit = new Map<string, UnitEvidence>();
    for (const unit of units) {
      byUnit.set(unit.unitId, {
        byLearner: new Map(),
        attempts: 0,
        weightedSample: 0,
        successWeight: 0,
      });
    }
    if (userIds.length === 0 || units.length === 0) return byUnit;

    const unitOfItem = new Map<string, string>();
    for (const unit of units) for (const itemId of unit.itemIds) unitOfItem.set(itemId, unit.unitId);

    const rows = await this.prisma.attemptEvidence.findMany({
      where: { userId: { in: [...userIds] }, exerciseId: { in: [...unitOfItem.keys()] } },
      select: {
        userId: true,
        exerciseId: true,
        passed: true,
        ratingApplied: true,
        answerMode: true,
        bankSize: true,
        wordsConsumed: true,
        templateCode: true,
        gapPosition: true,
      },
    });

    for (const row of rows) {
      const unitId = unitOfItem.get(row.exerciseId);
      if (unitId === undefined) continue;
      const unit = byUnit.get(unitId);
      if (unit === undefined) continue;

      const { succeeded, weight } = weighAttempt(row);

      const learner = unit.byLearner.get(row.userId) ?? {
        attempts: 0,
        weightedSample: 0,
        successWeight: 0,
      };
      learner.attempts += 1;
      learner.weightedSample += weight;
      if (succeeded) learner.successWeight += weight;
      unit.byLearner.set(row.userId, learner);

      unit.attempts += 1;
      unit.weightedSample += weight;
      if (succeeded) unit.successWeight += weight;
    }

    return byUnit;
  }
}

/** The columns of `attempt_evidence` the evidence scale reads. */
export interface WeighableAttempt {
  passed: boolean | null;
  ratingApplied: string;
  answerMode: string | null;
  bankSize: number | null;
  wordsConsumed: boolean | null;
  templateCode: string | null;
  gapPosition: number | null;
}

/**
 * How much one recorded attempt proves, and in which direction.
 *
 * `passed` is the exercise's own verdict and the one the screen's axis is named after;
 * the FSRS rating stands in only for rows written before that column existed. The weight
 * itself is imported from the profile's scale rather than invented here, so that a word
 * picked out of two counts for less on this screen too.
 */
export function weighAttempt(row: WeighableAttempt): { succeeded: boolean; weight: number } {
  const succeeded = row.passed ?? succeededAt(row.ratingApplied as ReviewRatingValue);
  const weight = evidenceWeight({
    succeeded,
    answerForm:
      row.answerMode === null
        ? null
        : {
            mode: row.answerMode as 'bank' | 'free',
            bankSize: row.bankSize,
            wordsConsumed: row.wordsConsumed ?? false,
          },
    templateCode: row.templateCode,
    gapPosition: row.gapPosition,
  });
  return { succeeded, weight };
}

/**
 * The weighted share of attempts that went well, or `null` when nothing was weighed.
 *
 * `null` rather than `0`: no attempts is not a run of failures, and the one rule this
 * whole package is built around is that those two never print the same thing.
 */
export function qualityOf(evidence: { weightedSample: number; successWeight: number }): number | null {
  if (evidence.weightedSample <= 0) return null;
  return evidence.successWeight / evidence.weightedSample;
}
