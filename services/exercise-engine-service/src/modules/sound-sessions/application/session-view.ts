import type { Attempt } from '../../attempts/domain/entities/attempt.entity.js';
import type { ProbeTask } from '../../probes/domain/entities/probe-task.entity.js';
import type { PlanBasis, SessionPlan } from '../domain/session-plan.js';
import {
  currentStep,
  MAX_TAKES,
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
  | { phase: 'diagnostic'; atomId: string; family: string; index: number; total: number; word: string }
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
    fails: step.fails,
  };
}
