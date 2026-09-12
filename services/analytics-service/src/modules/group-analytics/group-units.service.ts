import { Injectable } from '@nestjs/common';
import { cellStateOf, distributionOf, type CellState } from '@ssz/shared-kernel/analytics';
import { evidenceWeight, succeededAt } from '@ssz/shared-kernel/mastery';
import type { ReviewRatingValue } from '@ssz/shared-kernel/evidence';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CourseOutlineService } from '../projections/course-outline.service.js';
import { SchedulingClient } from '../../infrastructure/http/scheduling.client.js';

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

/** What the lesson journal says about one course unit. */
export interface UnitDelivery {
  /** 1 taught in full, 0.5 begun, 0 not at all. */
  value: 0 | 0.5 | 1;
  lessons: number;
  lastHeldAt: string | null;
  /** A unit of the teaching plan names this course unit. */
  linked: boolean;
}

/** A plan unit nobody stitched to the course — shown always (DECISIONS §O3). */
export interface UnlinkedPlanUnit {
  curriculumUnitId: string;
  title: string;
  lessons: number;
  lastHeldAt: string | null;
}

/**
 * The journal's side of the two axes, already keyed by course unit.
 *
 * `null` from `deliveryOf` means the timetable could not be asked at all; this object
 * with an empty map means it was asked and taught nothing.
 */
export interface GroupDeliveryView {
  byUnit: Map<string, UnitDelivery>;
  unlinkedPlanUnits: UnlinkedPlanUnit[];
  lessonsHeld: number;
  lessonsPlanned: number;
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
    private readonly scheduling: SchedulingClient,
  ) {}

  /**
   * What the group was actually taught, folded onto the course's own units.
   *
   * `null` when scheduling could not be reached — the callers then answer "we could not
   * ask the timetable" instead of drawing a course nobody taught (plan 58 §2 G). Several
   * plan units may teach the same course unit, so lessons add up and the latest date
   * wins.
   */
  async deliveryOf(groupId: string): Promise<GroupDeliveryView | null> {
    const delivery = await this.scheduling.getGroupDelivery(groupId);
    if (delivery === null) return null;

    const held = new Map<string, { lessons: number; sessions: number; lastHeldAt: string | null }>();
    const unlinkedPlanUnits: UnlinkedPlanUnit[] = [];

    for (const unit of delivery.units) {
      if (unit.contentUnitId === null) {
        unlinkedPlanUnits.push({
          curriculumUnitId: unit.curriculumUnitId,
          title: unit.title,
          lessons: unit.lessonsHeld,
          lastHeldAt: unit.lastHeldAt,
        });
        continue;
      }

      const seen = held.get(unit.contentUnitId) ?? { lessons: 0, sessions: 0, lastHeldAt: null };
      seen.lessons += unit.lessonsHeld;
      seen.sessions += unit.plannedSessions;
      if (unit.lastHeldAt !== null && (seen.lastHeldAt === null || unit.lastHeldAt > seen.lastHeldAt)) {
        seen.lastHeldAt = unit.lastHeldAt;
      }
      held.set(unit.contentUnitId, seen);
    }

    const byUnit = new Map<string, UnitDelivery>();
    for (const [unitId, seen] of held) {
      // Half is "begun but not finished", a different sentence from either end: a unit
      // two lessons into four has been delivered to nobody's satisfaction, and rounding
      // it either way would make the chart lean the same way every time.
      const value: 0 | 0.5 | 1 =
        seen.lessons === 0 ? 0 : seen.sessions > 0 && seen.lessons >= seen.sessions ? 1 : 0.5;
      byUnit.set(unitId, {
        value,
        lessons: seen.lessons,
        lastHeldAt: seen.lastHeldAt,
        linked: true,
      });
    }

    return {
      byUnit,
      unlinkedPlanUnits,
      lessonsHeld: delivery.lessonsHeld,
      lessonsPlanned: delivery.lessonsPlanned,
    };
  }

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

/**
 * How much of the course each learner has taken away, over the units that were taught.
 *
 * Counted over taught units only: the half of the course nobody has reached yet is not a
 * shortfall of the group, and counting it would put every group below its own line in
 * week one. A learner who has touched none of them is absent from the map rather than
 * present at zero — which is what makes "nothing measured yet" answerable.
 *
 * The group's median and one learner's own number come out of this same map: the chart
 * says where the group is, the learner's screen says where they are against it, and the
 * two would part company the first time one of them redefined "taught".
 */
export function absorbedOverall(input: {
  userIds: readonly string[];
  units: readonly CourseUnit[];
  absorbed: Map<string, Map<string, LearnerAbsorbed>>;
  /** `null` → the timetable could not be asked; then every unit counts. */
  delivery: GroupDeliveryView | null;
}): Map<string, number> {
  const { userIds, units, absorbed, delivery } = input;

  const counted = units.filter((unit) => {
    if (unit.items === 0) return false;
    if (delivery === null) return true;
    return unitDeliveryOf(delivery, unit.unitId).value > 0;
  });

  const shares = new Map<string, number>();
  if (counted.length === 0) return shares;

  for (const userId of userIds) {
    let passed = 0;
    let items = 0;
    let touched = false;
    for (const unit of counted) {
      const cell = absorbed.get(unit.unitId)?.get(userId);
      if (cell === undefined || !cell.touched) continue;
      touched = true;
      passed += cell.passed;
      items += unit.items;
    }
    if (touched && items > 0) shares.set(userId, passed / items);
  }

  return shares;
}

/** The distribution of `absorbedOverall`, or `null` when nobody in it was measured. */
export function absorbedDistribution(shares: Map<string, number>) {
  return distributionOf([...shares.values()]);
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

/**
 * What the journal says about one course unit, for a unit it never mentions.
 *
 * A course unit no plan unit names has been taught to nobody as far as the journal can
 * tell, and that is a statement about the plan (`linked: false`), not about the group.
 */
export function unitDeliveryOf(delivery: GroupDeliveryView, unitId: string): UnitDelivery {
  return delivery.byUnit.get(unitId) ?? { value: 0, lessons: 0, lastHeldAt: null, linked: false };
}

/**
 * One learner's share of one unit — the number both the chart and the heatmap print.
 *
 * `null`, never `0`, for a learner who has not opened the unit, and for a unit with no
 * items at all: neither of them has a result to be low.
 */
export function absorbedShareOf(
  cell: LearnerAbsorbed | undefined,
  unit: Pick<CourseUnit, 'items'>,
): number | null {
  if (cell === undefined || !cell.touched) return null;
  if (unit.items === 0) return null;
  return cell.passed / unit.items;
}

/** One learner's one unit, as both the heatmap and the group's summary read it. */
export interface LearnerUnitCell {
  state: CellState;
  /** `0..1`, not percent — the surfaces round once, on their way out. */
  value: number | null;
  weightedSample: number;
}

/**
 * Name what one learner did with one unit — the single computation behind the heatmap
 * (phase 3) and behind the `notJudgeable` counter in the group's summary (§O5).
 *
 * Two of them would drift apart the first time either changed its mind about what counts
 * as started, and the screens sit one above the other: the summary claims a number of
 * cells no reader can judge, and the map underneath has to hatch exactly those.
 *
 * The value is `absorbed` — the share of the unit's items this learner passed, which is
 * what the map's legend is labelled with — while the verdict threshold is counted in
 * weighted attempts, as the tooltip promises ("3 of 8 weighted samples"). Engagement and
 * evidence are deliberately different questions: reading a text is engagement that leaves
 * no weighted sample behind, and a learner who did the reading must not be called
 * `notStarted`.
 */
export function learnerCellOf(input: {
  unit: CourseUnit;
  absorbed: LearnerAbsorbed | undefined;
  evidence: LearnerEvidence | undefined;
  /** `null` when the timetable could not be asked — then no cell is blamed on delivery. */
  delivered: UnitDelivery | null;
  minWeightedSample: number;
}): LearnerUnitCell {
  const { unit, absorbed, evidence, delivered, minWeightedSample } = input;
  const share = absorbedShareOf(absorbed, unit);
  const weightedSample = evidence?.weightedSample ?? 0;

  // Any sign of the learner meeting the unit at all, whether or not it was gradeable:
  // an opened lesson counts, and so does a single attempt.
  const engaged = (evidence?.attempts ?? 0) + (absorbed?.touched === true ? 1 : 0);

  const state = cellStateOf({
    // `undefined`, not `false`: an unreachable timetable is not a unit nobody taught.
    delivered: delivered === null ? undefined : delivered.value > 0,
    linked: delivered === null ? undefined : delivered.linked,
    items: unit.items,
    attempts: engaged,
    sample: weightedSample,
    minSample: minWeightedSample,
    value: share,
  });

  // A cell the reader is being told something else about carries no number: one learner
  // who ran ahead of the class does not turn "we have not taught this yet" into a score,
  // and a share printed under a `notDelivered` shape would be read as one. `insufficient`
  // keeps its number — the screen shows it under the hatching, beside the evidence it
  // was made on.
  return {
    state,
    value: HOLDS_NO_NUMBER.has(state) ? null : share,
    weightedSample,
  };
}

/** States whose whole message is that there is nothing to score here. */
const HOLDS_NO_NUMBER = new Set<CellState>(['notStarted', 'notDelivered', 'unlinked', 'noContent']);
