import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Who still uses a piece of content (plan 90, phase 5, step 4b). content-service asks before it
 * deletes a purged school's materials, and again for obsolete courses (step 4c): a course with an
 * active learner is kept as `obsolete` instead of being deleted.
 *
 * An active learner holds the content — an `ACTIVE` enrolment (containers only) or an open
 * assignment (`ACTIVE` / `OVERDUE`) — **and** has been active in it within the window: the hold
 * itself started in the window, or a progress record on the content or on one of its leaves
 * (supplied by content, which owns the tree) changed in the window. A hold left untouched for
 * longer does not keep the content alive.
 */

/** Caps keep one request under the default 100 kB body limit; content-service sends chunks. */
export const ACTIVE_LEARNERS_MAX_ITEMS = 200;
export const ACTIVE_LEARNERS_MAX_IDS = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTIVE_LEARNER_CONTENT_TYPES = [
  'container',
  'lesson',
  'vocabulary_list',
  'grammar_rule',
  'exercise',
] as const;
export type ActiveLearnerContentType = (typeof ACTIVE_LEARNER_CONTENT_TYPES)[number];

export interface ActiveLearnersItem {
  contentType: ActiveLearnerContentType;
  contentId: string;
  /** Lessons, exercises… inside a container; progress on any of them is activity in it. */
  leafIds: string[];
}

/** An enrolment or an open assignment: the learner holds the content since `since`. */
export interface ContentHold {
  userId: string;
  contentType: ActiveLearnerContentType;
  contentId: string;
  since: Date;
}

/** A progress record of the learner that changed inside the window. */
export interface ProgressTouch {
  userId: string;
  contentId: string;
}

export interface ActiveLearnersAnswer {
  contentType: ActiveLearnerContentType;
  contentId: string;
  activeLearners: number;
}

export function countActiveLearners(
  items: readonly ActiveLearnersItem[],
  holds: readonly ContentHold[],
  touches: readonly ProgressTouch[],
  activeSince: Date,
): ActiveLearnersAnswer[] {
  const touched = new Map<string, Set<string>>();
  for (const t of touches) {
    let ids = touched.get(t.userId);
    if (!ids) touched.set(t.userId, (ids = new Set()));
    ids.add(t.contentId);
  }

  return items.map((item) => {
    const scope = [item.contentId, ...item.leafIds];
    const learners = new Set<string>();
    for (const hold of holds) {
      if (hold.contentType !== item.contentType || hold.contentId !== item.contentId) continue;
      if (learners.has(hold.userId)) continue;
      const ids = touched.get(hold.userId);
      const recent =
        hold.since.getTime() >= activeSince.getTime() || scope.some((id) => ids?.has(id) ?? false);
      if (recent) learners.add(hold.userId);
    }
    return {
      contentType: item.contentType,
      contentId: item.contentId,
      activeLearners: learners.size,
    };
  });
}

/** The request body, checked by hand (internal route, no DTO class). */
export function parseActiveLearnersBody(input: unknown): {
  activeSince: Date;
  items: ActiveLearnersItem[];
} {
  const body = (input ?? {}) as { activeSince?: unknown; items?: unknown };
  const activeSince = typeof body.activeSince === 'string' ? new Date(body.activeSince) : null;
  if (!activeSince || Number.isNaN(activeSince.getTime())) {
    throw new UnprocessableEntityException('activeSince must be an ISO 8601 date');
  }
  if (!Array.isArray(body.items)) throw new UnprocessableEntityException('items must be an array');
  if (body.items.length > ACTIVE_LEARNERS_MAX_ITEMS) {
    throw new UnprocessableEntityException(
      `at most ${ACTIVE_LEARNERS_MAX_ITEMS} items per request`,
    );
  }

  let ids = 0;
  const items = body.items.map((raw: unknown): ActiveLearnersItem => {
    const item = raw as { contentType?: unknown; contentId?: unknown; leafIds?: unknown };
    if (!ACTIVE_LEARNER_CONTENT_TYPES.includes(item?.contentType as ActiveLearnerContentType)) {
      throw new UnprocessableEntityException(
        `contentType must be one of ${ACTIVE_LEARNER_CONTENT_TYPES.join(', ')}`,
      );
    }
    if (typeof item.contentId !== 'string' || !UUID.test(item.contentId)) {
      throw new UnprocessableEntityException('contentId must be a UUID');
    }
    const leafIds = item.leafIds ?? [];
    if (!Array.isArray(leafIds) || leafIds.some((id) => typeof id !== 'string' || !UUID.test(id))) {
      throw new UnprocessableEntityException('leafIds must be an array of UUIDs');
    }
    ids += 1 + leafIds.length;
    return {
      contentType: item.contentType as ActiveLearnerContentType,
      contentId: item.contentId,
      leafIds,
    };
  });
  if (ids > ACTIVE_LEARNERS_MAX_IDS) {
    throw new UnprocessableEntityException(
      `at most ${ACTIVE_LEARNERS_MAX_IDS} ids (contentId + leafIds) per request`,
    );
  }
  return { activeSince, items };
}
