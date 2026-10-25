import type { GroupTeacher } from '../../../infrastructure/http/organization.client.js';

/** A journal row as the reader needs it: accepted at the term, perhaps revised since. */
export interface AcceptanceRow {
  attemptId: string;
  groupId: string | null;
  acceptedAt: Date;
  aiOutcome: string | null;
  revisedBy: string | null;
  revisedOutcome: string | null;
}

/**
 * How many counted at the term, how many of them a teacher then gave their own verdict on
 * (`revised`), and how many of those went the other way (`overturned`). Opening the card
 * without a verdict is not a revision (decided 25.10).
 */
export interface TermTally {
  accepted: number;
  revised: number;
  overturned: number;
}

export interface TeacherTermTally extends TermTally {
  userId: string;
  name: string;
}

export interface SchoolTermSummary extends TermTally {
  /**
   * Counted on nobody: work outside a group, or a group with no teacher that day. `null`
   * with `teachers` when organization-service could not be asked.
   */
  unattributed: number | null;
  teachers: TeacherTermTally[] | null;
}

/** The group's teachers on a term day, keyed by `termKey`. */
export type TeachersByTerm = ReadonlyMap<string, GroupTeacher[]>;

/** The UTC day a term ran out on — the day whose assignments are asked. */
export function termDay(acceptedAt: Date): string {
  return acceptedAt.toISOString().slice(0, 10);
}

export function termKey(groupId: string, day: string): string {
  return `${day}|${groupId}`;
}

/**
 * Who answered for a group's work on the day of its term (decided 25.10): a substitute in
 * force takes it alone; otherwise the primary and co-primary teacher both.
 */
export function answerableTeachers(teachers: GroupTeacher[]): GroupTeacher[] {
  const substitutes = teachers.filter((t) => t.role === 'substitute');
  if (substitutes.length > 0) return substitutes;
  return teachers.filter((t) => t.role === 'primary' || t.role === 'co_primary');
}

/**
 * The school's journal over a range, each work counted once at school level and once per
 * teacher it is put on. A teacher's `revised` is only their own verdicts on work put on them;
 * the school's counts every revision, whoever gave it.
 *
 * `teachersByTerm` `null` — the assignments could not be read; totals still stand.
 */
export function summarizeTerms(
  rows: readonly AcceptanceRow[],
  teachersByTerm: TeachersByTerm | null,
): SchoolTermSummary {
  const school: TermTally = { accepted: 0, revised: 0, overturned: 0 };
  const byTeacher = new Map<string, TeacherTermTally>();
  let unattributed = 0;

  for (const row of rows) {
    const overturned = row.revisedBy !== null && row.revisedOutcome !== row.aiOutcome;
    school.accepted++;
    if (row.revisedBy !== null) school.revised++;
    if (overturned) school.overturned++;

    if (teachersByTerm === null) continue;
    const assigned =
      row.groupId === null
        ? []
        : answerableTeachers(teachersByTerm.get(termKey(row.groupId, termDay(row.acceptedAt))) ?? []);
    if (assigned.length === 0) {
      unattributed++;
      continue;
    }

    // One teacher may hold two roles in a group; the work is still theirs once.
    for (const teacher of new Map(assigned.map((t) => [t.userId, t])).values()) {
      let tally = byTeacher.get(teacher.userId);
      if (!tally) {
        tally = { userId: teacher.userId, name: teacher.name, accepted: 0, revised: 0, overturned: 0 };
        byTeacher.set(teacher.userId, tally);
      }
      tally.accepted++;
      if (row.revisedBy === teacher.userId) {
        tally.revised++;
        if (overturned) tally.overturned++;
      }
    }
  }

  if (teachersByTerm === null) return { ...school, unattributed: null, teachers: null };

  const teachers = [...byTeacher.values()].sort(
    (a, b) => b.accepted - a.accepted || a.name.localeCompare(b.name),
  );
  return { ...school, unattributed, teachers };
}
