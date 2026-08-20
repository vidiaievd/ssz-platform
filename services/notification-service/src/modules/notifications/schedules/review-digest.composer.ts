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
}

/** One teacher, one school, work that has been waiting past what the school promised. */
export interface TeacherEscalation {
  userId: string;
  schoolId: string;
  overdue: number;
  oldestSubmittedAt: Date;
  escalateAfterHours: number;
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
): TeacherDigest[] {
  const byGroup = groupPending(pending);

  const byTeacher = new Map<string, { lines: DigestGroupLine[]; times: Date[] }>();
  for (const group of reviewers) {
    const submissions = byGroup.get(group.groupId);
    if (submissions === undefined || submissions.length === 0) continue;

    for (const teacher of group.teachers) {
      const entry = byTeacher.get(teacher.userId) ?? { lines: [], times: [] };
      entry.lines.push({ groupId: group.groupId, pending: submissions.length });
      entry.times.push(...submissions);
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

function earliest(times: Date[]): Date {
  return times.reduce((oldest, at) => (at < oldest ? at : oldest));
}

function latest(times: Date[]): Date {
  return times.reduce((newest, at) => (at > newest ? at : newest));
}
