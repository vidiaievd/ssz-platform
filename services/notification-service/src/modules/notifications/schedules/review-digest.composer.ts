/**
 * Who should hear what about the work waiting on them — decided without touching a
 * clock, a database or a network (plan 47.5).
 *
 * The job around this is three calls and a loop; everything that could be *wrong* is
 * here, in functions that take what they are given and return what should be sent. It is
 * the part worth testing, and the part that must not be rewritten the day the digest
 * moves to email or the queue moves service.
 */

/** One submission waiting, as the engine's aggregate reports it. */
export interface PendingSubmission {
  groupId: string | null;
  containerId: string | null;
  submittedAt: Date;
}

/**
 * One submission a model's provisional verdict will close by itself (plan 80, step 5), as
 * the engine's `review/terms` reports it.
 */
export interface TermAhead {
  attemptId: string;
  groupId: string | null;
  autoAcceptAt: Date;
}

/** Who reviews one group, as organization-service answers `reviewers(sub)`. */
export interface ReviewerGroup {
  groupId: string;
  teachers: { userId: string; name: string }[];
}

/** What one teacher was last told, from `review_digest_state`. */
export interface DigestState {
  lastMaxSubmittedAt: Date;
  lastEscalatedAt: Date | null;
}

/** One group's share of one teacher's queue. */
export interface DigestGroupLine {
  groupId: string;
  pending: number;
}

/** One message to one teacher about one school. */
export interface TeacherDigest {
  userId: string;
  schoolId: string;
  pending: number;
  oldestSubmittedAt: Date;
  /** Written to the state row after sending — the mark the next run compares against. */
  newestSubmittedAt: Date;
  /** Biggest group first, because that is the one to start with. */
  groups: DigestGroupLine[];
  /** Of what is waiting, how much a model's verdict will close by itself soon (plan 80). */
  expiring: number;
  earliestAutoAcceptAt: Date | null;
}

/**
 * One teacher, one school: work that will count as the model marked it unless they open it
 * first (plan 80, R3). Sent once per submission per teacher.
 */
export interface TeacherTermWarning {
  userId: string;
  schoolId: string;
  expiring: number;
  earliestAutoAcceptAt: Date;
  /** Written to `review_term_warnings` after sending — what this teacher has now heard of. */
  attemptIds: string[];
  /** Biggest group first, as in the digest. */
  groups: DigestGroupLine[];
}

/** One teacher, one school, work that has been waiting past what the school promised. */
export interface TeacherEscalation {
  userId: string;
  schoolId: string;
  overdue: number;
  oldestSubmittedAt: Date;
  escalateAfterHours: number;
}

/** One school's queue as an administrator is told about it (plan 47.5 threshold, 47.6). */
export interface SchoolReviewSummary {
  schoolId: string;
  pending: number;
  /** Past what the school itself allows — the number that makes this worth sending. */
  overdue: number;
  oldestSubmittedAt: Date;
  oldestAgeHours: number;
  /** The groups the late work sits in, for the `primary_teacher` escalation target. */
  overdueGroupIds: string[];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The digests one school's waiting work earns, one per teacher who can act on it.
 *
 * Three things it deliberately does *not* do:
 *
 * - **Speak for work nobody reviews.** A submission whose group has no teacher assigned
 *   produces no message here at all. It is not lost — the oversight screen shows it as
 *   unassigned (44.11) — but inventing a recipient for it would send a stranger a list
 *   they cannot act on, and quietly hide the fact that nobody is on it.
 * - **Send twice for the same work.** A teacher hears again only once something newer
 *   than their last digest has arrived. Compared by submission time rather than by count,
 *   because marking one and receiving one leaves the count exactly where it was
 *   (criterion 41).
 * - **Count a group twice.** A teacher covering three groups gets one message with three
 *   lines, not three messages — the whole point of a digest.
 */
export function composeDigests(
  schoolId: string,
  pending: PendingSubmission[],
  reviewers: ReviewerGroup[],
  states: Map<string, DigestState>,
  terms: TermAhead[] = [],
): TeacherDigest[] {
  const byGroup = groupPending(pending);
  const termsByGroup = groupTerms(terms);

  const byTeacher = new Map<
    string,
    { lines: DigestGroupLine[]; times: Date[]; terms: TermAhead[] }
  >();
  for (const group of reviewers) {
    const submissions = byGroup.get(group.groupId);
    if (submissions === undefined || submissions.length === 0) continue;

    for (const teacher of group.teachers) {
      const entry = byTeacher.get(teacher.userId) ?? { lines: [], times: [], terms: [] };
      entry.lines.push({ groupId: group.groupId, pending: submissions.length });
      entry.times.push(...submissions);
      entry.terms.push(...(termsByGroup.get(group.groupId) ?? []));
      byTeacher.set(teacher.userId, entry);
    }
  }

  const digests: TeacherDigest[] = [];
  for (const [userId, entry] of byTeacher) {
    const newest = latest(entry.times);
    const state = states.get(userId);
    // Nothing has arrived since we last wrote to them. Their queue may still be long, and
    // saying so again would train them to ignore the message that matters.
    if (state && state.lastMaxSubmittedAt >= newest) continue;

    digests.push({
      userId,
      schoolId,
      pending: entry.times.length,
      oldestSubmittedAt: earliest(entry.times),
      newestSubmittedAt: newest,
      groups: [...entry.lines].sort((a, b) => b.pending - a.pending),
      // Carried, never a reason to send: a term running out has a message of its own
      // (`composeTermWarnings`), and a digest is still about what has newly arrived.
      expiring: entry.terms.length,
      earliestAutoAcceptAt:
        entry.terms.length > 0 ? earliest(entry.terms.map((term) => term.autoAcceptAt)) : null,
    });
  }

  return digests.sort((a, b) => b.pending - a.pending);
}

/**
 * Whose queue has gone past what the school promised, at most once a day each.
 *
 * A separate message from the digest, and a separate clock: the digest says "here is
 * what is waiting", which is routine, and this says "something here is late", which is
 * not — and a late submission that is no longer new would never produce a digest to
 * carry the news.
 *
 * `escalateAfterHours` is the school's own number (44.12), so the platform never decides
 * for a school what counts as late.
 */
export function composeEscalations(
  schoolId: string,
  pending: PendingSubmission[],
  reviewers: ReviewerGroup[],
  states: Map<string, DigestState>,
  settings: { escalateAfterHours: number },
  now: Date,
): TeacherEscalation[] {
  const cutoff = new Date(now.getTime() - settings.escalateAfterHours * HOUR_MS);
  const overdue = pending.filter((item) => item.submittedAt <= cutoff);
  if (overdue.length === 0) return [];

  const byGroup = groupPending(overdue);
  const dayAgo = new Date(now.getTime() - 24 * HOUR_MS);

  const byTeacher = new Map<string, Date[]>();
  for (const group of reviewers) {
    const submissions = byGroup.get(group.groupId);
    if (submissions === undefined || submissions.length === 0) continue;

    for (const teacher of group.teachers) {
      byTeacher.set(teacher.userId, [...(byTeacher.get(teacher.userId) ?? []), ...submissions]);
    }
  }

  const escalations: TeacherEscalation[] = [];
  for (const [userId, times] of byTeacher) {
    const state = states.get(userId);
    // Once a day. Being told daily that yesterday's work is still late is a reminder;
    // being told every six hours is a reason to stop reading these at all.
    if (state?.lastEscalatedAt && state.lastEscalatedAt > dayAgo) continue;

    escalations.push({
      userId,
      schoolId,
      overdue: times.length,
      oldestSubmittedAt: earliest(times),
      escalateAfterHours: settings.escalateAfterHours,
    });
  }

  return escalations.sort((a, b) => b.overdue - a.overdue);
}

/**
 * Who should hear that a model's verdict is about to count by itself (plan 80, R3):
 * "the term is running out, the work will be accepted as it stands".
 *
 * Once per submission per teacher, whatever the clock does: `alreadyWarned` holds the
 * pairs this job has written about, and a teacher hears again only when a submission they
 * have not been told about enters the window. The message then names everything still
 * expiring in their groups, not only the new — the count they read is the one they can act
 * on — and every submission in it is marked, so the next run stays quiet.
 *
 * Work with no group has no reviewer to warn, exactly as in the digest.
 */
export function composeTermWarnings(
  schoolId: string,
  terms: TermAhead[],
  reviewers: ReviewerGroup[],
  alreadyWarned: Set<string>,
): TeacherTermWarning[] {
  const termsByGroup = groupTerms(terms);

  const byTeacher = new Map<string, { lines: DigestGroupLine[]; terms: TermAhead[] }>();
  for (const group of reviewers) {
    const expiring = termsByGroup.get(group.groupId);
    if (expiring === undefined || expiring.length === 0) continue;

    for (const teacher of group.teachers) {
      const entry = byTeacher.get(teacher.userId) ?? { lines: [], terms: [] };
      entry.lines.push({ groupId: group.groupId, pending: expiring.length });
      entry.terms.push(...expiring);
      byTeacher.set(teacher.userId, entry);
    }
  }

  const warnings: TeacherTermWarning[] = [];
  for (const [userId, entry] of byTeacher) {
    const fresh = entry.terms.some((term) => !alreadyWarned.has(warnedKey(term.attemptId, userId)));
    if (!fresh) continue;

    warnings.push({
      userId,
      schoolId,
      expiring: entry.terms.length,
      earliestAutoAcceptAt: earliest(entry.terms.map((term) => term.autoAcceptAt)),
      attemptIds: entry.terms.map((term) => term.attemptId),
      groups: [...entry.lines].sort((a, b) => b.pending - a.pending),
    });
  }

  return warnings.sort((a, b) => b.expiring - a.expiring);
}

/** The pair a term warning is remembered by. */
export function warnedKey(attemptId: string, userId: string): string {
  return `${attemptId}|${userId}`;
}

/**
 * The school's own queue, in the three numbers an administrator can act on.
 *
 * `null` when nothing is waiting at all — a weekly summary of an empty queue is a weekly
 * message teaching its reader that these can be ignored. A queue that is full but on time
 * is *not* nothing: it still says how much is in flight, and only the escalation caller
 * insists on `overdue > 0`.
 *
 * Work with no group is counted here, unlike in the digests. Nobody can be written to
 * about it individually, but it is the school's problem and an administrator is exactly
 * who should see it (44.11 calls the same rows unassigned).
 */
export function summariseSchool(
  schoolId: string,
  pending: PendingSubmission[],
  settings: { escalateAfterHours: number },
  now: Date,
): SchoolReviewSummary | null {
  if (pending.length === 0) return null;

  const cutoff = new Date(now.getTime() - settings.escalateAfterHours * HOUR_MS);
  const overdue = pending.filter((item) => item.submittedAt <= cutoff);
  const oldest = earliest(pending.map((item) => item.submittedAt));

  return {
    schoolId,
    pending: pending.length,
    overdue: overdue.length,
    oldestSubmittedAt: oldest,
    oldestAgeHours: Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / HOUR_MS)),
    overdueGroupIds: [
      ...new Set(
        overdue.map((item) => item.groupId).filter((id): id is string => id !== null),
      ),
    ],
  };
}

/**
 * Submissions by the group they belong to.
 *
 * Work that carried no group is dropped rather than pooled under a placeholder: nobody
 * reviews "no group", and a bucket nobody can be assigned to would only make the totals
 * disagree with the queues teachers actually see.
 */
function groupPending(pending: PendingSubmission[]): Map<string, Date[]> {
  const byGroup = new Map<string, Date[]>();
  for (const item of pending) {
    if (item.groupId === null) continue;
    byGroup.set(item.groupId, [...(byGroup.get(item.groupId) ?? []), item.submittedAt]);
  }
  return byGroup;
}

/** Terms by group, dropping work with none — nobody reviews "no group". */
function groupTerms(terms: TermAhead[]): Map<string, TermAhead[]> {
  const byGroup = new Map<string, TermAhead[]>();
  for (const term of terms) {
    if (term.groupId === null) continue;
    byGroup.set(term.groupId, [...(byGroup.get(term.groupId) ?? []), term]);
  }
  return byGroup;
}

function earliest(times: Date[]): Date {
  return times.reduce((oldest, at) => (at < oldest ? at : oldest));
}

function latest(times: Date[]): Date {
  return times.reduce((newest, at) => (at > newest ? at : newest));
}
