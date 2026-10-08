// Judging a probe and summing up a sitting (plan 72 §3.6–3.7).
//
// The key never reaches the browser before a probe closes, so judging is the server's — the same
// reasoning as `multiple_choice` (plan 53 Q1): the second chance means something only while the
// page does not know which button is right. This module is the judgement itself, shared by the
// engine and by the builder's preview, which holds the whole document anyway.
//
// **The first answer is what counts** (DECISIONS §5: «A second chance is recorded as a separate
// probe result. The first answer still rates the contrast atom»). A second try can close a
// probe as right; it never makes the score.

import { filledWords, findWord } from './derive.js';
import type { Feedback, MinimalPairsContent, Provenance } from './model.js';
import { pairContrastId } from './packs/index.js';
import type { DealtProbe, History } from './sampler.js';
import { historyKey } from './sampler.js';

/** What the attempt remembers about one probe. */
export interface ProbeState {
  n: number;
  /** Option ids in the order they were tapped. */
  picks: string[];
  closed: boolean;
}

/**
 * Tries a probe allows. In an assignment (`graded`) the second chance is off: one check per item,
 * as every dosed type does in `GRADED` (plan 67 Q8-A, plan 68) — decided for this type by plan 72
 * Q6-A, which leaves the verdict and the A/B comparison on because they are the exercise.
 */
export function maxTries(feedback: Feedback, graded: boolean): number {
  return !graded && feedback.secondChance ? 2 : 1;
}

export interface PickVerdict {
  correct: boolean;
  /** No tries left, or answered right. The key may be shown now and not before. */
  closed: boolean;
  /** This was the probe's first answer — the one that counts. */
  first: boolean;
}

export type PickRefusal = 'closed' | 'not_an_option';

export function judgePick(
  probe: DealtProbe,
  state: ProbeState | undefined,
  optionId: string,
  tries: number,
): { verdict: PickVerdict; next: ProbeState } | { refused: PickRefusal } {
  if (state?.closed) return { refused: 'closed' };
  if (!probe.optionIds.includes(optionId)) return { refused: 'not_an_option' };
  const picks = [...(state?.picks ?? []), optionId];
  const correct = optionId === probe.wordId;
  const closed = correct || picks.length >= Math.max(1, tries);
  return {
    verdict: { correct, closed, first: picks.length === 1 },
    next: { n: probe.n, picks, closed },
  };
}

export function firstCorrect(probe: DealtProbe, state: ProbeState | undefined): boolean {
  return state?.picks[0] === probe.wordId;
}

export interface PairResult {
  pairId: string;
  /** The pair's spellings, in its own order. */
  words: string[];
  played: number;
  correct: number;
}

export interface Summary {
  right: number;
  total: number;
  /** Whole percent of first answers that were right. */
  score: number;
  passed: boolean;
  passPct: number;
  /** Only the pairs that came up (`MPSummary`: `filter((x) => x.n)`). */
  pairs: PairResult[];
}

/** The sitting as the student sees it at the end. A probe never answered counts as wrong. */
export function summarize(ex: MinimalPairsContent, draw: DealtProbe[], states: ProbeState[]): Summary {
  const byN = new Map(states.map((s) => [s.n, s]));
  const right = draw.filter((p) => firstCorrect(p, byN.get(p.n))).length;
  const total = draw.length;
  const score = total === 0 ? 0 : Math.round((right / total) * 100);
  const pairs: PairResult[] = [];
  for (const pair of ex.pairs) {
    const mine = draw.filter((p) => p.pairId === pair.id);
    if (mine.length === 0) continue;
    pairs.push({
      pairId: pair.id,
      words: filledWords(pair).map((w) => w.text),
      played: mine.length,
      correct: mine.filter((p) => firstCorrect(p, byN.get(p.n))).length,
    });
  }
  return { right, total, score, passed: score >= ex.scoring.passPct, passPct: ex.scoring.passPct, pairs };
}

/**
 * One probe, as it is kept for the teacher and for the report to come (plan 72 §3.7): what was
 * played, the first and the last answer, how many tries, and the clip's provenance — DECISIONS §2:
 * «it travels into the report so a bad batch can be traced later».
 */
export interface ProbeRecord {
  n: number;
  pairId: string;
  wordId: string;
  /** The spelling played, so a history can be read without the document. */
  text: string;
  contrastId: string;
  first: string | null;
  final: string | null;
  tries: number;
  correct: boolean;
  provenance: Provenance | null;
}

export function probeRecords(ex: MinimalPairsContent, draw: DealtProbe[], states: ProbeState[]): ProbeRecord[] {
  const byN = new Map(states.map((s) => [s.n, s]));
  return draw.map((p) => {
    const state = byN.get(p.n);
    const word = findWord(ex, p.wordId);
    const pair = ex.pairs.find((x) => x.id === p.pairId);
    return {
      n: p.n,
      pairId: p.pairId,
      wordId: p.wordId,
      text: word?.text ?? '',
      contrastId: pair ? pairContrastId(ex, pair) : ex.contrastId,
      first: state?.picks[0] ?? null,
      final: state?.picks[state.picks.length - 1] ?? null,
      tries: state?.picks.length ?? 0,
      correct: firstCorrect(p, state),
      provenance: word?.clip.provenance ?? null,
    };
  });
}

/**
 * The student's history of one contrast, from the records of their earlier sittings — what
 * `weakest` reads (plan 72 §3.11). A record of another contrast is ignored.
 */
export function historyFrom(records: readonly ProbeRecord[], contrastId: string): History {
  const out: History = {};
  for (const r of records) {
    if (r.contrastId !== contrastId || r.text.trim() === '') continue;
    const key = historyKey(r.text);
    const h = out[key] ?? { played: 0, missed: 0 };
    h.played += 1;
    if (!r.correct) h.missed += 1;
    out[key] = h;
  }
  return out;
}

/** Read probe records out of an untrusted column; anything malformed is dropped. */
export function readProbeRecords(value: unknown): ProbeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ProbeRecord[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (typeof r['n'] !== 'number' || typeof r['wordId'] !== 'string' || typeof r['contrastId'] !== 'string') {
      return [];
    }
    const s = (v: unknown) => (typeof v === 'string' ? v : null);
    const prov = r['provenance'];
    return [
      {
        n: r['n'],
        pairId: s(r['pairId']) ?? '',
        wordId: r['wordId'],
        text: s(r['text']) ?? '',
        contrastId: r['contrastId'],
        first: s(r['first']),
        final: s(r['final']),
        tries: typeof r['tries'] === 'number' ? r['tries'] : 0,
        correct: r['correct'] === true,
        provenance: prov === 'studio' || prov === 'teacher' || prov === 'tts' ? prov : null,
      },
    ];
  });
}
