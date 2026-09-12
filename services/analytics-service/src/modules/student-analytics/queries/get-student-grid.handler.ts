import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { cellStateOf, pct } from '@ssz/shared-kernel/analytics';
import { FOCUSES, SKILLS } from '@ssz/shared-kernel/skills';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { ContentClient, type CourseCoverage } from '../../../infrastructure/http/content.client.js';
import type { AppConfig } from '../../../config/configuration.js';
import { StudentAccessService } from '../student-access.service.js';
import { GetStudentGridQuery } from './student-analytics.queries.js';
import type { StudentGridResponseDto, StudentGridCellDto } from '../dto/student-analytics-response.dto.js';

/**
 * Screen C's grid — every `skill × focus` pair, named rather than scored.
 *
 * The grid is drawn in full, four channels by five subjects, including the pairs the
 * learner has never met: the point of the screen is the shape of the emptiness. Today
 * most of it is empty — the whole `listening` row, because no clip is published, and most
 * of `focus`, because nothing classifies it — and the screen has to say which emptiness
 * is which. `noContent` is a fact about the course; `notStarted` is a fact about the
 * learner; `insufficient` is a fact about how much we have seen. Three different
 * sentences, and a `0%` in place of any of them would be a lie.
 */
@QueryHandler(GetStudentGridQuery)
@Injectable()
export class GetStudentGridHandler
  implements IQueryHandler<GetStudentGridQuery, StudentGridResponseDto>
{
  private readonly minWeightedSample: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StudentAccessService,
    private readonly content: ContentClient,
    config: ConfigService<AppConfig>,
  ) {
    this.minWeightedSample = config.get<AppConfig['mastery']>('mastery')?.minWeightedSample ?? 8;
  }

  async execute(query: GetStudentGridQuery): Promise<StudentGridResponseDto> {
    const { studentId, viewerUserId, courseId } = query;
    await this.access.assertMayRead(studentId, viewerUserId);

    const [rows, coverage] = await Promise.all([
      this.prisma.skillMastery.findMany({
        where: { userId: studentId, ...(courseId === null ? {} : { courseId }) },
      }),
      courseId === null ? Promise.resolve(null) : this.content.getCoverage(courseId),
    ]);

    const byCell = new Map(rows.map((row) => [`${row.skill}:${row.focus}`, row]));

    const cells: StudentGridCellDto[] = [];
    for (const skill of SKILLS) {
      for (const focus of FOCUS_AXIS) {
        const row = byCell.get(`${skill}:${focus}`);
        const attempts = row?.attempts ?? 0;
        const weightedSample = row?.weightedSample ?? 0;
        const ewma = row?.successRateEwma ?? null;

        cells.push({
          skill,
          focus,
          state: cellStateOf({
            items: itemsFor(coverage, skill, focus),
            attempts,
            sample: weightedSample,
            minSample: this.minWeightedSample,
            value: attempts === 0 ? null : ewma,
          }),
          ewma: attempts === 0 ? null : pct(ewma),
          meanStability: row?.meanStability ?? null,
          attempts,
          weightedSample: Math.round(weightedSample * 100) / 100,
        });
      }
    }

    // Attempts that landed outside the drawn grid — a skill nothing could derive. The
    // screen says how many rather than dropping them: "we could not place 40 attempts" is
    // the coverage report's finding arriving from the learner's side, and a grid quietly
    // short by forty is how that finding gets lost.
    const unclassifiedAttempts = rows
      .filter((row) => !(SKILLS as readonly string[]).includes(row.skill))
      .reduce((sum, row) => sum + row.attempts, 0);

    return {
      studentId,
      courseId,
      minWeightedSample: this.minWeightedSample,
      unclassifiedAttempts,
      coverageUnavailable: courseId !== null && coverage === null,
      // The screen prints "nothing measured for this student yet" instead of a grid: an
      // empty grid is read as a bad grid, and this learner has simply not started.
      nothingMeasured: rows.every((row) => row.attempts === 0),
      cells,
    };
  }
}

/**
 * The grid's subject axis: the four named subjects plus the bucket an attempt lands in
 * when nothing could classify it — today that is nearly all of them (no `ContentRelation`
 * rows are seeded), and a grid without the column would look empty for the wrong reason.
 */
const FOCUS_AXIS: readonly string[] = [...FOCUSES, 'unknown'];

/**
 * How many published items stand behind one cell — or `undefined` where we cannot say.
 *
 * The coverage report gives the two margins of the table, not the table itself, so a zero
 * margin is conclusive ("this course trains no listening at all") while a non-zero one is
 * not ("it trains listening, and it trains grammar, but perhaps never both at once").
 * Concluding only from the zeroes means some genuinely empty pairs come back as
 * `notStarted` rather than `noContent` — the safe direction: a learner is never told the
 * course is missing something it actually contains.
 */
function itemsFor(
  coverage: CourseCoverage | null,
  skill: string,
  focus: string,
): number | undefined {
  if (coverage === null || !coverage.available) return undefined;
  if (coverage.emptySkills.includes(skill)) return 0;
  if ((coverage.bySkill[skill] ?? 0) === 0) return 0;
  if ((coverage.byFocus[focus] ?? 0) === 0) return 0;
  return undefined;
}
