import { subjectSentences } from '../../application/review-input.js';
import { ERROR_ASPECTS } from '../../domain/review-aspect.js';
import type { ReviewCase } from './review-case.js';

/** A candidate's remark, reduced to where it points. */
export interface CandidateRemark {
  sentenceIndex: number;
  aspect: string;
  /** Null for a remark about the text as a whole. */
  fragment: string | null;
}

/** How a candidate remark relates to the teacher's word on the set. */
export type RemarkVerdict =
  /** Lands on an error the teacher kept (accepted or edited), same aspect. */
  | 'confirmed'
  /** Lands on a kept error, under another aspect. */
  | 'confirmed_other_aspect'
  /** Repeats a remark the teacher threw out. */
  | 'rejected'
  /** Nothing in the set to judge it by. */
  | 'unjudged';

/** One case's tally. Counts only — no text. */
export interface CaseScore {
  /** Remarks the teacher kept: the errors the candidate should find. */
  confirmed: number;
  /** …of them, found by the candidate on the same fragment and aspect. */
  confirmedFound: number;
  /** …of them, found on the same fragment under any aspect. */
  confirmedFoundAnyAspect: number;
  /** Remarks the teacher threw out: what the candidate should not repeat. */
  rejected: number;
  /** …of them, repeated by the candidate (same fragment, any aspect). */
  rejectedRepeated: number;
  /** Sentences the teacher decided on. */
  sentences: number;
  /** …where "the candidate named an error in it" matches "the teacher did not accept it". */
  sentencesAgreed: number;
  /** One per candidate remark, in its order. */
  remarks: Array<{ sentenceIndex: number; aspect: string; verdict: RemarkVerdict }>;
}

/**
 * The candidate's remarks on one submission, measured against the teacher's decisions.
 *
 * The teacher's word on a remark is the signal: kept (accepted or edited) means "this is an
 * error, put this way"; thrown out means "not an error, or not worth saying". A remark the
 * teacher saw and left alone (`untouched`) is neither, and counts for nothing — it is not
 * the same as thrown out (plan 79, 1.5 notes).
 *
 * Two remarks are on the same spot when they are about the same sentence and their
 * fragments overlap in the learner's answer: a candidate quoting "bor her" for the
 * teacher's "bor" has found the same error. Two remarks without a quotation (an essay's
 * `task` or `structure`) are on the same spot when their aspect is the same — there is no
 * place to compare, and "about the whole text" under two aspects is two different things.
 *
 * The sentence verdict is a coarser check that also sees errors no model offered: a
 * sentence the teacher did not accept should draw an error remark, and one they accepted
 * should draw none. An `alternative` remark (error_correction: "differs from the key, and
 * right") names no error, so it counts as no remark there. A rubric-marked essay has no
 * sentence verdicts, so it adds nothing to that check.
 */
export function scoreCase(evalCase: ReviewCase, candidate: CandidateRemark[]): CaseScore {
  const sentences = subjectSentences(evalCase.subject);
  const answers = sentences.map((s) => s.answer);
  const kept = evalCase.offered.remarks.filter((_, i) => isKept(evalCase.outcomes.remarks[i]));
  const thrown = evalCase.offered.remarks.filter((_, i) => evalCase.outcomes.remarks[i] === 'discarded');
  const sameSpot = (a: CandidateRemark, b: { sentenceIndex: number; aspect: string; fragment: string | null }) => {
    if (a.sentenceIndex !== b.sentenceIndex) return false;
    if (a.fragment === null || b.fragment === null) return a.fragment === b.fragment && a.aspect === b.aspect;
    return overlaps(answers[a.sentenceIndex - 1] ?? '', a.fragment, b.fragment);
  };

  const remarks = candidate.map((remark) => {
    const verdict: RemarkVerdict = kept.some((k) => sameSpot(remark, k) && k.aspect === remark.aspect)
      ? 'confirmed'
      : kept.some((k) => sameSpot(remark, k))
        ? 'confirmed_other_aspect'
        : thrown.some((t) => sameSpot(remark, t))
          ? 'rejected'
          : 'unjudged';
    return { sentenceIndex: remark.sentenceIndex, aspect: remark.aspect, verdict };
  });

  const indexOf = new Map(sentences.map((s, i) => [s.itemId, i + 1]));
  const decided = evalCase.decisions.filter((d) => indexOf.has(d.itemId));
  const remarked = new Set(
    candidate.filter((r) => (ERROR_ASPECTS as readonly string[]).includes(r.aspect)).map((r) => r.sentenceIndex),
  );

  return {
    confirmed: kept.length,
    confirmedFound: kept.filter((k) => candidate.some((c) => sameSpot(c, k) && c.aspect === k.aspect)).length,
    confirmedFoundAnyAspect: kept.filter((k) => candidate.some((c) => sameSpot(c, k))).length,
    rejected: thrown.length,
    rejectedRepeated: thrown.filter((t) => candidate.some((c) => sameSpot(c, t))).length,
    sentences: decided.length,
    sentencesAgreed: decided.filter((d) => remarked.has(indexOf.get(d.itemId)!) === !d.approved).length,
    remarks,
  };
}

/** One case of a run: how the call went and, when it answered, its score. */
export interface CaseResult {
  caseId: string;
  outcome: 'ok' | 'invalid_response' | 'error';
  errorCode: string | null;
  latencyMs: number;
  /** Null unless the outcome is `ok`. */
  score: CaseScore | null;
}

/** A run's verdict on the candidate. Rates are null when nothing could be counted for them. */
export interface RunScores {
  cases: number;
  ok: number;
  invalidResponse: number;
  error: number;
  /** Share of the teacher's kept remarks the candidate found, same fragment and aspect. */
  confirmedRecall: number | null;
  /** The same, any aspect. */
  confirmedRecallAnyAspect: number | null;
  /** Share of the teacher's thrown-out remarks the candidate repeated — lower is better. */
  rejectedRepeatRate: number | null;
  /** Share of decided sentences where remark / no remark matches the teacher's verdict. */
  sentenceAgreement: number | null;
  /** Of the candidate's remarks, the share on spots the teacher kept (any aspect). */
  remarkPrecision: number | null;
  remarksPerCase: number | null;
  totals: {
    confirmed: number;
    confirmedFound: number;
    confirmedFoundAnyAspect: number;
    rejected: number;
    rejectedRepeated: number;
    sentences: number;
    sentencesAgreed: number;
    remarks: number;
    remarksOnConfirmed: number;
  };
  avgLatencyMs: number | null;
}

/**
 * The run's scores. Only answered cases are scored — a case the candidate failed has no
 * remarks to compare, and its failure is counted on its own (`invalidResponse`, `error`).
 */
export function summarize(results: CaseResult[]): RunScores {
  const scored = results.flatMap((r) => (r.score ? [r.score] : []));
  const sum = (pick: (s: CaseScore) => number) => scored.reduce((total, s) => total + pick(s), 0);
  const totals = {
    confirmed: sum((s) => s.confirmed),
    confirmedFound: sum((s) => s.confirmedFound),
    confirmedFoundAnyAspect: sum((s) => s.confirmedFoundAnyAspect),
    rejected: sum((s) => s.rejected),
    rejectedRepeated: sum((s) => s.rejectedRepeated),
    sentences: sum((s) => s.sentences),
    sentencesAgreed: sum((s) => s.sentencesAgreed),
    remarks: sum((s) => s.remarks.length),
    remarksOnConfirmed: sum((s) => s.remarks.filter((r) => r.verdict.startsWith('confirmed')).length),
  };

  return {
    cases: results.length,
    ok: results.filter((r) => r.outcome === 'ok').length,
    invalidResponse: results.filter((r) => r.outcome === 'invalid_response').length,
    error: results.filter((r) => r.outcome === 'error').length,
    confirmedRecall: rate(totals.confirmedFound, totals.confirmed),
    confirmedRecallAnyAspect: rate(totals.confirmedFoundAnyAspect, totals.confirmed),
    rejectedRepeatRate: rate(totals.rejectedRepeated, totals.rejected),
    sentenceAgreement: rate(totals.sentencesAgreed, totals.sentences),
    remarkPrecision: rate(totals.remarksOnConfirmed, totals.remarks),
    remarksPerCase: scored.length > 0 ? round(totals.remarks / scored.length) : null,
    totals,
    avgLatencyMs:
      results.length > 0 ? Math.round(results.reduce((total, r) => total + r.latencyMs, 0) / results.length) : null,
  };
}

function isKept(outcome: string | undefined): boolean {
  return outcome === 'accepted' || outcome === 'edited';
}

/**
 * Whether two quotes from the same answer cover overlapping text. A quote is placed at its
 * first occurrence; one that cannot be found (the key changed under the set) only matches
 * an identical quote.
 */
export function overlaps(answer: string, a: string, b: string): boolean {
  const start = (s: string) => answer.indexOf(s);
  const [aStart, bStart] = [start(a), start(b)];
  if (aStart < 0 || bStart < 0) return a === b;
  return aStart < bStart + b.length && bStart < aStart + a.length;
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? round(part / whole) : null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
