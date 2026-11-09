import type { Attempt } from '../../attempts/domain/entities/attempt.entity.js';
import type { ProbeTask } from '../../probes/domain/entities/probe-task.entity.js';
import type { PlanBasis, SessionPlan } from '../domain/session-plan.js';
import { carrierSentence } from '../domain/carrier.js';
import {
  currentStep,
  MAX_TAKES,
  takeIndex,
  type CurrentStep,
  type DoneReason,
  type SessionState,
  type SoundProgress,
} from '../domain/session-step.js';

/**
 * What the learner is to say now, without the clips: a clip goes out as a signed link from
 * `/items` (step 13.4d), never as an asset id. Words are not a secret here — the session shows
 * them, and the learner says them.
 */
export type StepView =
  | {
      phase: 'diagnostic';
      atomId: string;
      family: string;
      index: number;
      total: number;
      word: string;
      /** What the learner says: the word in its carrier frame. */
      sentence: string;
    }
  | {
      phase: 'drill';
      atomId: string;
      family: string;
      elementIndex: number;
      element:
        | { kind: 'word'; word: string }
        | { kind: 'pair'; words: [string, string]; judged: number[] }
        | { kind: 'phrase'; text: string; carriers: string[] };
      /** The word said in this take; null for a phrase. */
      say: string | null;
      /** What the learner says: the word in its carrier frame, or the course line. */
      sentence: string;
      fails: number;
    };

export interface SoundSessionView {
  attemptId: string;
  probeId: string;
  /** An open session was handed back rather than a new one begun. */
  resumed: boolean;
  language: string;
  basis: PlanBasis;
  expiresAt: string;
  phase: SessionState['phase'];
  doneReason: DoneReason | null;
  takes: number;
  maxTakes: number;
  /** Every take recorded so far, the diagnostic's included; a take is sent with it (`/takes`). */
  takeIndex: number;
  sounds: Array<{ atomId: string; family: string; status: SoundProgress['status'] }>;
  /** Null unless the session opened with the diagnostic. */
  diagnostic: { measured: number; total: number } | null;
  step: StepView | null;
}

export function sessionView(
  s: { attempt: Attempt; probe: ProbeTask; plan: SessionPlan; state: SessionState },
  resumed: boolean,
): SoundSessionView {
  const { attempt, probe, plan, state } = s;
  const familyOf = new Map(
    [...plan.sounds, ...plan.candidates].map((sound) => [sound.atomId, sound.family] as const),
  );
  return {
    attemptId: attempt.id,
    probeId: probe.id,
    resumed,
    language: plan.language,
    basis: plan.basis,
    expiresAt: probe.expiresAt.toISOString(),
    phase: state.phase,
    doneReason: state.doneReason,
    takes: state.takes,
    maxTakes: MAX_TAKES,
    takeIndex: takeIndex(state),
    sounds: state.sounds.map((p) => ({ atomId: p.atomId, family: familyOf.get(p.atomId) ?? '', status: p.status })),
    diagnostic:
      plan.basis === 'diagnostic'
        ? { measured: state.diagnostic.filter((d) => d.status !== 'open').length, total: plan.diagnostic.length }
        : null,
    step: stepView(plan, state),
  };
}

export function stepView(plan: SessionPlan, state: SessionState): StepView | null {
  const step = currentStep(plan, state);
  if (!step) return null;
  if (step.phase === 'diagnostic') {
    return {
      phase: 'diagnostic',
      atomId: step.atomId,
      family: step.family,
      index: step.index,
      total: step.total,
      word: step.word.word,
      sentence: carrierSentence(plan.language, step.word.word) ?? step.word.word,
    };
  }
  const e = step.element;
  return {
    phase: 'drill',
    atomId: step.atomId,
    family: step.family,
    elementIndex: step.elementIndex,
    element:
      e.kind === 'word'
        ? { kind: 'word', word: e.word.word }
        : e.kind === 'pair'
          ? { kind: 'pair', words: [e.words[0].word, e.words[1].word], judged: [...e.judged] }
          : { kind: 'phrase', text: e.text, carriers: [...e.carriers] },
    say: step.say?.word ?? null,
    sentence: sentenceOf(plan.language, step),
    fails: step.fails,
  };
}

/** The sentence a take of this step is: the course line, or the word in its carrier frame. */
export function sentenceOf(language: string, step: CurrentStep): string {
  if (step.phase === 'diagnostic') return carrierSentence(language, step.word.word) ?? step.word.word;
  if (step.element.kind === 'phrase') return step.element.text;
  const word = step.say?.word ?? '';
  return carrierSentence(language, word) ?? word;
}
