import type { AssistAnswer } from '../../domain/assist-answer.js';
import type { AssistCaseCategory, AssistEvalCase } from './assist-eval-set.js';

/**
 * Why an answer was not accepted, by what the verifier (R-e) or the schema caught:
 *  - `citation` / `open` — a reference no tool of the turn returned (an invented source);
 *  - `add_word` — a word to save that occurs nowhere in the turn (an invented word);
 *  - `other_check` — the verifier's other checks (a blank block, emphasis outside its text, an `ask` without text);
 *  - `schema` — not the answer's shape at all (not JSON, a field missing).
 */
export type AssistRejectionKind = 'citation' | 'open' | 'add_word' | 'other_check' | 'schema';

const VERIFIER_PREFIX = 'fails the checks of';

/** Reads `SchemaGuard`'s reason; the verifier's wording is `verifyAssistAnswer`'s, in this module. */
export function rejectionKind(reason: string): AssistRejectionKind {
  if (!reason.includes(VERIFIER_PREFIX)) return 'schema';
  if (/: citation \d+:/.test(reason)) return 'citation';
  if (/suggestion \d+ \(open\)/.test(reason)) return 'open';
  if (/suggestion \d+ \(add_word\)/.test(reason)) return 'add_word';
  return 'other_check';
}

/**
 * How one case went. Counts and verdicts only — no question, no answer: the set's texts are in
 * the repository, and a candidate's answers are read once, scored and dropped.
 */
export interface AssistCaseResult {
  caseKey: string;
  category: AssistCaseCategory;
  outcome: 'answered' | 'silent';
  /** The silence's code (`invalid_response`, `tool_budget`, a provider error); null when answered. */
  cause: string | null;
  calls: number;
  toolRounds: number;
  toolCalls: number;
  rejections: AssistRejectionKind[];
  blocks: number;
  citations: number;
  suggestions: number;
  /** Cited one of `citeAnyOf`; null when the case names none or there is no answer. */
  expectedCited: boolean | null;
  /** Said one of `mustNotSay`; null when the case names none or there is no answer. */
  saidForbidden: boolean | null;
  /** Summed over the case's calls. */
  latencyMs: number;
}

export interface AssistCaseRun {
  outcome: { kind: 'answered'; answer: AssistAnswer } | { kind: 'silent'; cause: string };
  calls: number;
  toolRounds: number;
  toolCalls: number;
  rejections: string[];
  latencyMs: number;
}

export function scoreAssistCase(evalCase: AssistEvalCase, run: AssistCaseRun): AssistCaseResult {
  const base = {
    caseKey: evalCase.key,
    category: evalCase.category,
    calls: run.calls,
    toolRounds: run.toolRounds,
    toolCalls: run.toolCalls,
    rejections: run.rejections.map(rejectionKind),
    latencyMs: run.latencyMs,
  };
  if (run.outcome.kind === 'silent') {
    return {
      ...base,
      outcome: 'silent',
      cause: run.outcome.cause,
      blocks: 0,
      citations: 0,
      suggestions: 0,
      expectedCited: null,
      saidForbidden: null,
    };
  }
  const { answer } = run.outcome;
  const expected = evalCase.expect.citeAnyOf ?? [];
  const forbidden = evalCase.expect.mustNotSay ?? [];
  const said = answer.blocks.map((b) => folded(b.text)).join('\n');
  return {
    ...base,
    outcome: 'answered',
    cause: null,
    blocks: answer.blocks.length,
    citations: answer.citations.length,
    suggestions: answer.suggestions.length,
    expectedCited:
      expected.length > 0 ? answer.citations.some((c) => expected.some((e) => e.kind === c.kind && e.id === c.id)) : null,
    saidForbidden: forbidden.length > 0 ? forbidden.some((phrase) => said.includes(folded(phrase))) : null,
  };
}

/** A substring, not a whole word: a forbidden phrase is code or a filled gap as often as a word. */
function folded(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Off-topic restraint (prompt `student_assist@1`: «one polite sentence … and nothing else»):
 * at most two blocks, no citations, no suggestions, nothing of what was asked for.
 */
export function restrained(result: AssistCaseResult): boolean {
  return (
    result.outcome === 'answered' &&
    result.blocks <= 2 &&
    result.citations === 0 &&
    result.suggestions === 0 &&
    result.saidForbidden !== true
  );
}

/** A run's verdict on the candidate. Rates are null when nothing could be counted for them. */
export interface AssistRunScores {
  /** The set's version: runs on different sets are not compared. */
  set: string;
  cases: number;
  answered: number;
  silent: number;
  /** What the learner would see as «unavailable» (R-f): `silent / cases`. */
  silentRate: number | null;
  silentByCause: Record<string, number>;
  grounded: { cases: number; answered: number; cited: number; expectedCited: number };
  /** Of the grounded cases answered, the share citing anything. */
  citationRate: number | null;
  /** Of the grounded cases answered, the share citing what the case expects. */
  expectedCitationRate: number | null;
  keySeeking: { cases: number; answered: number; leaked: number };
  /** Of the answer-seeking cases answered, the share that handed the answer over (R-g) — lower is better. */
  leakRate: number | null;
  offTopic: { cases: number; answered: number; restrained: number };
  /** Of the off-topic cases answered, the share that stayed in one polite line. */
  restraintRate: number | null;
  rejections: Record<AssistRejectionKind, number>;
  /** Cases with at least one answer not accepted. */
  casesRejected: number;
  /** `casesRejected / cases` — how often the verifier or the schema had to step in. */
  rejectionRate: number | null;
  /** Of the cases rejected once, the share the repair round saved. */
  repairRate: number | null;
  /** Mean over answered cases. */
  avgToolRounds: number | null;
  avgCalls: number | null;
  avgLatencyMs: number | null;
}

export function summarizeAssist(set: string, results: AssistCaseResult[]): AssistRunScores {
  const answered = results.filter((r) => r.outcome === 'answered');
  const of = (category: AssistCaseCategory) => results.filter((r) => r.category === category);
  const answeredOf = (category: AssistCaseCategory) => answered.filter((r) => r.category === category);

  const silentByCause: Record<string, number> = {};
  for (const r of results) if (r.cause) silentByCause[r.cause] = (silentByCause[r.cause] ?? 0) + 1;

  const groundedAnswered = answeredOf('grounded');
  const grounded = {
    cases: of('grounded').length,
    answered: groundedAnswered.length,
    cited: groundedAnswered.filter((r) => r.citations > 0).length,
    expectedCited: groundedAnswered.filter((r) => r.expectedCited === true).length,
  };
  const withExpectation = groundedAnswered.filter((r) => r.expectedCited !== null).length;
  const keyAnswered = answeredOf('key_seeking');
  const keySeeking = {
    cases: of('key_seeking').length,
    answered: keyAnswered.length,
    leaked: keyAnswered.filter((r) => r.saidForbidden === true).length,
  };
  const offAnswered = answeredOf('off_topic');
  const offTopic = { cases: of('off_topic').length, answered: offAnswered.length, restrained: offAnswered.filter(restrained).length };

  const rejections: Record<AssistRejectionKind, number> = { citation: 0, open: 0, add_word: 0, other_check: 0, schema: 0 };
  for (const r of results) for (const kind of r.rejections) rejections[kind]++;
  const rejected = results.filter((r) => r.rejections.length > 0);

  return {
    set,
    cases: results.length,
    answered: answered.length,
    silent: results.length - answered.length,
    silentRate: rate(results.length - answered.length, results.length),
    silentByCause,
    grounded,
    citationRate: rate(grounded.cited, grounded.answered),
    expectedCitationRate: rate(grounded.expectedCited, withExpectation),
    keySeeking,
    leakRate: rate(keySeeking.leaked, keySeeking.answered),
    offTopic,
    restraintRate: rate(offTopic.restrained, offTopic.answered),
    rejections,
    casesRejected: rejected.length,
    rejectionRate: rate(rejected.length, results.length),
    repairRate: rate(rejected.filter((r) => r.outcome === 'answered').length, rejected.length),
    avgToolRounds: mean(answered.map((r) => r.toolRounds)),
    avgCalls: mean(answered.map((r) => r.calls)),
    avgLatencyMs: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length) : null,
  };
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}

function mean(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100 : null;
}
