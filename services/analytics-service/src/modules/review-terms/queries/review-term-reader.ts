import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { OrganizationClient } from '../../../infrastructure/http/organization.client.js';
import type { GroupTeacher } from '../../../infrastructure/http/organization.client.js';
import { summarizeTerms, termDay, termKey } from '../domain/attribution.js';
import type { AcceptanceRow, SchoolTermSummary } from '../domain/attribution.js';

/**
 * Reads the auto-acceptance journal of one school over a range and puts each work on the
 * teachers who answered for its group on the day of its term (plan 80, step 6b).
 *
 * Organization is asked once per term day, for that day's groups: assignments are kept with
 * dates there, and the day the term ran out is the question.
 */
@Injectable()
export class ReviewTermReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationClient,
  ) {}

  /** `from`/`to` — inclusive UTC days `YYYY-MM-DD`, already validated. */
  async summarize(schoolId: string, from: string, to: string): Promise<SchoolTermSummary> {
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);

    // Rows without `accepted_at` are revisions with nothing to revise (work closed before 6a).
    const rows: AcceptanceRow[] = (
      await this.prisma.reviewTermAcceptance.findMany({
        where: { schoolId, acceptedAt: { gte: new Date(`${from}T00:00:00Z`), lt: end } },
        select: {
          attemptId: true,
          groupId: true,
          acceptedAt: true,
          aiOutcome: true,
          revisedBy: true,
          revisedOutcome: true,
        },
      })
    ).map((r) => ({ ...r, acceptedAt: r.acceptedAt as Date }));

    return summarizeTerms(rows, await this.teachersByTerm(rows));
  }

  private async teachersByTerm(rows: AcceptanceRow[]): Promise<Map<string, GroupTeacher[]> | null> {
    const groupsByDay = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.groupId === null) continue;
      const day = termDay(row.acceptedAt);
      const groups = groupsByDay.get(day) ?? new Set<string>();
      groups.add(row.groupId);
      groupsByDay.set(day, groups);
    }

    // Midnight of the day: assignments carry plain dates, both bounds inclusive.
    const answers = await Promise.all(
      [...groupsByDay].map(async ([day, groups]) => ({
        day,
        groups: await this.organization.teachersOf([...groups], new Date(`${day}T00:00:00Z`)),
      })),
    );

    const byTerm = new Map<string, GroupTeacher[]>();
    for (const { day, groups } of answers) {
      // Half an answer would put some days' work on nobody — say none could be read instead.
      if (groups === null) return null;
      for (const group of groups) byTerm.set(termKey(group.groupId, day), group.teachers);
    }
    return byTerm;
  }
}
