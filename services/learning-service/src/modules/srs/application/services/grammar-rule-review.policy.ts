import type { ReviewCard } from '../../domain/entities/review-card.entity.js';

/*
 * When a grammar rule is worth reviewing, and in what order its exercises come back
 * (VoxOrd mobile redesign, plan 05 step 7 — the practice handoff's §10.2, owner's
 * decision of 2026-10-28 to decide it here rather than on the phone).
 *
 * Everything is read off the EXERCISE cards of the rule's pool, as rule mastery is
 * (plan 21 §2.2). Two of the handoff's three criteria survive that:
 * - stale: mastery under 70 % and no practice for a week;
 * - mistakes: at least two pool cards whose last review lapsed (RELEARNING).
 * The third, a fall from the peak, needs a mastery history nobody keeps, and is left out.
 * «Two wrong in the last five attempts» becomes «two lapsed cards»: a card holds only its
 * latest state, and the attempts themselves live in exercise-engine.
 */

export const GRAMMAR_DUE_MASTERY_BELOW = 0.7;
export const GRAMMAR_DUE_STALE_DAYS = 7;
export const GRAMMAR_DUE_MISTAKES = 2;
export const GRAMMAR_REVIEW_POOL_LIMIT = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

export type GrammarDueReason = 'stale' | 'mistakes';

export interface GrammarPoolSummary {
  poolSize: number;
  introducedCount: number;
  averageRetrievability: number;
  /** The latest review of any pool card; null when none was ever reviewed. */
  lastPracticedAt: Date | null;
  /** Pool cards whose last review lapsed. */
  strugglingCount: number;
}

function isStruggling(card: ReviewCard): boolean {
  return card.state === 'RELEARNING';
}

export function summarisePool(
  exerciseIds: string[],
  cards: ReviewCard[],
  retrievabilityOf: (card: ReviewCard) => number,
): GrammarPoolSummary {
  const inPool = new Set(exerciseIds);
  const pooled = cards.filter((card) => inPool.has(card.contentId));
  const total = pooled.reduce((sum, card) => sum + retrievabilityOf(card), 0);
  let lastPracticedAt: Date | null = null;
  for (const card of pooled) {
    const at = card.lastReviewedAt;
    if (at && (!lastPracticedAt || at.getTime() > lastPracticedAt.getTime())) lastPracticedAt = at;
  }
  return {
    poolSize: exerciseIds.length,
    introducedCount: pooled.length,
    averageRetrievability: pooled.length === 0 ? 0 : total / pooled.length,
    lastPracticedAt,
    strugglingCount: pooled.filter(isStruggling).length,
  };
}

/** Why the rule is due; empty when it is not. A rule never practised is not due — it is new. */
export function grammarDueReasons(summary: GrammarPoolSummary, now: Date): GrammarDueReason[] {
  if (summary.introducedCount === 0) return [];
  const reasons: GrammarDueReason[] = [];
  const idleDays = summary.lastPracticedAt
    ? (now.getTime() - summary.lastPracticedAt.getTime()) / DAY_MS
    : Infinity;
  if (summary.averageRetrievability < GRAMMAR_DUE_MASTERY_BELOW && idleDays >= GRAMMAR_DUE_STALE_DAYS) {
    reasons.push('stale');
  }
  if (summary.strugglingCount >= GRAMMAR_DUE_MISTAKES) reasons.push('mistakes');
  return reasons;
}

/**
 * The exercises a review runs: lapsed cards first, then the longest unpractised (an
 * exercise without a card counts as never practised), ties in pool order.
 */
export function orderReviewPool(
  exerciseIds: string[],
  cards: ReviewCard[],
  limit = GRAMMAR_REVIEW_POOL_LIMIT,
): string[] {
  const byId = new Map(cards.map((card) => [card.contentId, card]));
  const ranked = exerciseIds.map((id, position) => {
    const card = byId.get(id);
    return {
      id,
      position,
      struggling: card ? isStruggling(card) : false,
      lastAt: card?.lastReviewedAt?.getTime() ?? -Infinity,
    };
  });
  ranked.sort(
    (a, b) =>
      Number(b.struggling) - Number(a.struggling) || a.lastAt - b.lastAt || a.position - b.position,
  );
  return ranked.slice(0, limit).map((entry) => entry.id);
}
