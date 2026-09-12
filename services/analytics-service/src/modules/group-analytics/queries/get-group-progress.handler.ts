import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { cellStateOf, distributionOf, pct } from '@ssz/shared-kernel/analytics';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import {
  GroupUnitsService,
  absorbedDistribution,
  absorbedOverall,
  absorbedShareOf,
  learnerCellOf,
  qualityOf,
  unitDeliveryOf,
  type CourseUnit,
  type GroupDeliveryView,
} from '../group-units.service.js';
import { WorkContextService } from '../work-context.service.js';
import { GetGroupProgressQuery } from './get-group-progress.query.js';
import type {
  GroupProgressResponseDto,
  GroupProgressUnitDto,
  UnlinkedPlanUnitDto,
  WorkContextBucketDto,
} from '../dto/group-progress-response.dto.js';

/**
 * Where "below the line" is drawn, as a share of the group's median.
 *
 * **Not calibrated** (DECISIONS, open question 1) — which is exactly why it leaves the
 * service as a sentence in the response rather than as a constant the screen knows: when
 * the number moves, no client ships.
 */
const BELOW_LINE_FACTOR = 0.5;
const BELOW_LINE_RULE = 'under half the group median';

/**
 * Screen A — what a group was taught against what it took away (plan 58, phase 2).
 *
 * The whole handler is arranged around one rule: **no surface prints `0%` where the truth
 * is "we do not know"**. Every aggregate below answers `null` on an empty sample, the
 * state of each unit is named by the shared kernel rather than derived from the value,
 * and the timetable being unreachable makes `delivered` null instead of zero.
 */
@QueryHandler(GetGroupProgressQuery)
@Injectable()
export class GetGroupProgressHandler
  implements IQueryHandler<GetGroupProgressQuery, GroupProgressResponseDto>
{
  private readonly minWeightedSample: number;
  private readonly minLearners: number;
  private readonly workContextSplitFrom: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly units: GroupUnitsService,
    private readonly workContext: WorkContextService,
    config: ConfigService<AppConfig>,
  ) {
    this.minWeightedSample = config.get<AppConfig['mastery']>('mastery')?.minWeightedSample ?? 8;
    const progress = config.get<AppConfig['groupProgress']>('groupProgress');
    this.minLearners = progress?.minLearnersPerUnit ?? 3;
    this.workContextSplitFrom = progress?.workContextSplitFrom ?? '2026-09-04';
  }

  async execute(query: GetGroupProgressQuery): Promise<GroupProgressResponseDto> {
    const { groupId, viewerUserId } = query;

    // ── 1. The group, and the viewer's right to it ──────────────────────────
    //
    // Membership of the group's school, and no finer: which teacher may see which group
    // is checked where the teacher roster is already loaded (plan 58 §2 F). The endpoint
    // is therefore softer than the screen, knowingly, and the risk is written in §4.
    const group = await this.prisma.groupDirectory.findUnique({ where: { groupId } });
    if (!group) throw new NotFoundException('Group not found');

    const viewer = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId: group.schoolId, userId: viewerUserId } },
    });
    if (!viewer) throw new NotFoundException('Group not found');

    const roster = await this.prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const userIds = roster.map((row) => row.userId);

    // ── 2. Everything the answer is built from, asked for at once ───────────
    const delivery = await this.units.deliveryOf(groupId);
    const courseId = group.courseId;

    const courseUnits = courseId === null ? [] : await this.units.unitsOf(courseId);
    const [absorbed, evidence, lastActivity, outlineRefreshedAt] = await Promise.all([
      this.units.absorbedByUnit(userIds, courseUnits),
      this.units.evidenceByUnit(userIds, courseUnits),
      this.lastActivityOf(userIds, courseId),
      this.outlineRefreshedAt(courseId),
    ]);

    // ── 4. One unit of the chart at a time ──────────────────────────────────
    let notJudgeable = 0;
    const units: GroupProgressUnitDto[] = courseUnits.map((unit) => {
      const learners = absorbed.get(unit.unitId) ?? new Map();
      // Untouched is absent from the sample, not present at zero: a learner who has not
      // opened the unit has no result, and averaging them in would drag the group's line
      // down with people who were never asked.
      const ratios = userIds
        .map((userId) => absorbedShareOf(learners.get(userId), unit))
        .filter((ratio): ratio is number => ratio !== null);

      const distribution = distributionOf(ratios);
      const unitEvidence = evidence.get(unit.unitId);
      const deliveredOf = delivery === null ? null : unitDeliveryOf(delivery, unit.unitId);

      // The same cell the heatmap under this chart draws, counted rather than drawn:
      // the summary promises a number of unjudgeable cells and the map below has to
      // hatch exactly those, so both ask one helper (§O5).
      for (const userId of userIds) {
        const cell = learnerCellOf({
          unit,
          absorbed: learners.get(userId),
          evidence: unitEvidence?.byLearner.get(userId),
          delivered: deliveredOf,
          minWeightedSample: this.minWeightedSample,
        });
        if (cell.state === 'insufficient') notJudgeable += 1;
      }

      return {
        unitId: unit.unitId,
        no: unit.no,
        title: unit.title,
        items: unit.items,
        delivered: deliveredOf,
        absorbed:
          distribution === null
            ? null
            : {
                median: pct(distribution.median) as number,
                p25: pct(distribution.p25) as number,
                p75: pct(distribution.p75) as number,
                n: distribution.n,
              },
        quality: unitEvidence === undefined ? null : pct(qualityOf(unitEvidence)),
        state: cellStateOf({
          // `undefined`, not `false`: the timetable was not asked, which is not the same
          // as being told the unit was never taught.
          delivered: deliveredOf === null ? undefined : deliveredOf.value > 0,
          linked: deliveredOf === null ? undefined : deliveredOf.linked,
          items: unit.items,
          // For a group's unit the sample is counted in learners who touched it, and the
          // threshold beside it is in the same unit — see `GROUP_UNIT_MIN_LEARNERS`.
          attempts: ratios.length,
          sample: ratios.length,
          minSample: this.minLearners,
          value: distribution?.median ?? null,
        }),
      };
    });

    // ── 5. Plan units nobody stitched — shown always (§O3) ──────────────────
    const unlinkedPlanUnits: UnlinkedPlanUnitDto[] = delivery?.unlinkedPlanUnits ?? [];

    // ── 6. Summary and work context ─────────────────────────────────────────
    const overall = this.overallAbsorbed(userIds, courseUnits, absorbed, delivery);
    const workContext = await this.workContext.of(userIds, courseId);

    // The oldest input decides how stale the answer is, so the newest of them is the most
    // the footer may claim. A group nothing has happened to still has its own row's time.
    const updatedAt = newest(
      [group.updatedAt, outlineRefreshedAt, lastActivity].filter((d): d is Date => d !== null),
    );

    return {
      groupId,
      courseId,
      updatedAt: updatedAt.toISOString(),
      minWeightedSample: this.minWeightedSample,
      workContextSplitFrom: this.workContextSplitFrom,
      deliveryUnavailable: delivery === null,
      units,
      unlinkedPlanUnits,
      summary: {
        deliveredUnits: units.filter((unit) => unit.delivered?.value === 1).length,
        plannedUnits: units.length,
        lessonsHeld: delivery?.lessonsHeld ?? 0,
        lessonsPlanned: delivery?.lessonsPlanned ?? 0,
        absorbedMedian: pct(overall.median),
        belowLine: overall.belowLine,
        belowLineRule: BELOW_LINE_RULE,
        notJudgeable,
        lastActivityAt: lastActivity?.toISOString() ?? null,
      },
      workContext: workContext.buckets,
      workContextUnattributed: workContext.unattributed,
    };
  }

  /**
   * Where the group as a whole stands, and how many of it are adrift.
   *
   * The shares themselves are `absorbedOverall`, shared with the learner's own screen so
   * that "you are here, the group is there" is two readings of one number.
   */
  private overallAbsorbed(
    userIds: readonly string[],
    courseUnits: readonly CourseUnit[],
    absorbed: Map<string, Map<string, { passed: number; touched: boolean }>>,
    delivery: GroupDeliveryView | null,
  ): { median: number | null; belowLine: number } {
    const shares = absorbedOverall({ userIds, units: courseUnits, absorbed, delivery });
    const distribution = absorbedDistribution(shares);
    if (distribution === null) return { median: null, belowLine: 0 };

    const line = distribution.median * BELOW_LINE_FACTOR;
    return {
      median: distribution.median,
      belowLine: [...shares.values()].filter((value) => value < line).length,
    };
  }

  /** The last thing anybody in this group did on this course, attempts or items alike. */
  private async lastActivityOf(
    userIds: readonly string[],
    courseId: string | null,
  ): Promise<Date | null> {
    if (userIds.length === 0) return null;

    const [attempt, item] = await Promise.all([
      this.prisma.attemptEvidence.findFirst({
        where: { userId: { in: [...userIds] }, ...(courseId !== null && { containerId: courseId }) },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
      this.prisma.itemProgress.findFirst({
        where: { userId: { in: [...userIds] } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    const dates = [attempt?.occurredAt, item?.updatedAt].filter((d): d is Date => d !== undefined);
    return dates.length === 0 ? null : newest(dates);
  }

  private async outlineRefreshedAt(courseId: string | null): Promise<Date | null> {
    if (courseId === null) return null;
    const row = await this.prisma.courseOutlineItem.findFirst({
      where: { containerId: courseId },
      orderBy: { refreshedAt: 'desc' },
      select: { refreshedAt: true },
    });
    return row?.refreshedAt ?? null;
  }
}

function newest(dates: readonly Date[]): Date {
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}
