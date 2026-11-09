import {
  soundsAfterDiagnostic,
  TONE_FAMILY,
  type MaterialWord,
  type PlannedSound,
  type SessionElement,
  type SessionPlan,
} from './session-plan.js';

/**
 * How a pronunciation session moves from take to take (plan 86, step 13.4a, §5.2 with Q28 and
 * §5.5a). One pure function, `nextState`, takes the stored state and the verdict of a take and
 * answers the new state and what happened; the client never repeats it. Tested by table.
 */

/** Takes of the drill in one session — fatigue, not cost (§5.5a). The diagnostic's are not counted. */
export const MAX_TAKES = 10;
/** Measured misses of one element before the sound is closed as not passed (§5.2). */
export const MAX_FAILS_PER_ELEMENT = 3;
/** Takes of one diagnostic word when it cannot be measured; then the family is left unknown. */
export const MAX_DIAGNOSTIC_TAKES = 2;

/**
 * The verdict of one take, from whichever check judged it (`sentence-checks` target or
 * `toneme-checks`), reduced to what the session moves on:
 * - not measured — the word was not heard, its sounds not named, the take silent, the provider
 *   refused: the take counts towards `MAX_TAKES`, never towards the element's misses (§5.2, Q28);
 * - measured — `key` names the miss (`KJ:major`); `explained` says whether this take's feedback
 *   carries the model's explanation of it (ai-service `target.explained`). Only an explained miss
 *   is remembered on the element, so a miss whose explanation failed is explained next time (§5.5a).
 */
export type TakeVerdict =
  | { measured: false }
  | { measured: true; passed: boolean; key: string | null; explained: boolean };

export interface ElementProgress {
  /** Which judged member of a pair is being said; 0 for a word or a phrase. */
  side: number;
  takes: number;
  fails: number;
  /** Keys of the misses the model has explained on this element, sent with every take (§5.5a). */
  explained: string[];
  status: 'open' | 'passed' | 'failed';
}

export interface SoundProgress {
  atomId: string;
  /** Index of the element being worked on; equals the ladder's length once the sound is closed. */
  at: number;
  elements: ElementProgress[];
  /** Measured takes that passed, and that missed, over the whole ladder. */
  passes: number;
  fails: number;
  status: 'pending' | 'open' | 'passed' | 'failed';
}

export interface DiagnosticProgress {
  atomId: string;
  takes: number;
  /** `unknown` — never measured in its takes; neither weak nor strong. */
  status: 'open' | 'strong' | 'weak' | 'unknown';
}

/**
 * - `finished` — every sound closed, or a diagnostic that found nothing weak;
 * - `take_limit` — `MAX_TAKES` spent;
 * - `stopped` — the learner ended it;
 * - `pool_empty` — the payer's credits ran out mid-session; what was measured stands (§5.5a);
 * - `not_available` — the payer lost access to the feature mid-session (plan, region); likewise.
 */
export type DoneReason = 'finished' | 'take_limit' | 'stopped' | 'pool_empty' | 'not_available';

export interface SessionState {
  phase: 'diagnostic' | 'drill' | 'done';
  doneReason: DoneReason | null;
  diagnostic: DiagnosticProgress[];
  sounds: SoundProgress[];
  /** Takes of the drill so far, measured or not. */
  takes: number;
  /**
   * Other sounds the takes' remarks named as weak, in the order first named (plan 86, step 13.5b):
   * flagged `ai_session` at hand-in, never rated (Q28). Absent in a state stored before 13.5b.
   */
  incidental?: string[];
}

export type StepEvent =
  | { kind: 'retry'; atomId: string }
  | { kind: 'side_passed'; atomId: string }
  | { kind: 'element_passed'; atomId: string }
  /** The sound closed as not passed: the session shows the base's drill and the course lesson (§5.5). */
  | { kind: 'sound_failed'; atomId: string }
  | { kind: 'sound_passed'; atomId: string }
  | { kind: 'diagnostic_measured'; atomId: string; weak: boolean }
  | { kind: 'diagnostic_done'; weak: string[] }
  | { kind: 'session_done'; reason: DoneReason };

/** How a take is heard: by Azure's scores of the family's sounds, or by the toneme's melody. */
export type Judge = 'sounds' | 'toneme';

/** What the learner is asked to say now, and how it will be judged. */
export type CurrentStep =
  | {
      phase: 'diagnostic';
      index: number;
      total: number;
      atomId: string;
      family: string;
      word: MaterialWord;
      judge: Judge;
      takes: number;
    }
  | {
      phase: 'drill';
      soundIndex: number;
      atomId: string;
      family: string;
      elementIndex: number;
      element: SessionElement;
      /** The word said in this take; null for a phrase. */
      say: MaterialWord | null;
      judge: Judge;
      /** `word` — the carrier frame, `fluent` — a course line. */
      context: 'word' | 'fluent';
      /** The words the take is judged on. */
      targetWords: string[];
      explained: string[];
      fails: number;
      takes: number;
    };

/** The state of a new session. */
export function startState(plan: SessionPlan): SessionState {
  if (plan.basis === 'diagnostic') {
    return {
      phase: 'diagnostic',
      doneReason: null,
      diagnostic: plan.diagnostic.map((d) => ({ atomId: d.atomId, takes: 0, status: 'open' })),
      sounds: [],
      takes: 0,
      incidental: [],
    };
  }
  return openDrill(plan.sounds, [], []);
}

/** The step in front of the learner; null once the session is done. */
export function currentStep(plan: SessionPlan, state: SessionState): CurrentStep | null {
  if (state.phase === 'diagnostic') {
    const index = state.diagnostic.findIndex((d) => d.status === 'open');
    const entry = plan.diagnostic[index];
    if (index < 0 || !entry) return null;
    return {
      phase: 'diagnostic',
      index,
      total: plan.diagnostic.length,
      atomId: entry.atomId,
      family: entry.family,
      word: entry.word,
      judge: judgeOf(entry.family),
      takes: state.diagnostic[index]!.takes,
    };
  }
  if (state.phase !== 'drill') return null;

  const soundIndex = state.sounds.findIndex((s) => s.status === 'open');
  const progress = state.sounds[soundIndex];
  const sound = progress ? ladderFor(plan, progress.atomId) : null;
  if (!progress || !sound) return null;
  const element = sound.elements[progress.at];
  const ep = progress.elements[progress.at];
  if (!element || !ep) return null;

  const said = sayOf(element, ep.side);
  return {
    phase: 'drill',
    soundIndex,
    atomId: sound.atomId,
    family: sound.family,
    elementIndex: progress.at,
    element,
    say: said,
    judge: judgeOf(sound.family),
    context: element.kind === 'phrase' ? 'fluent' : 'word',
    targetWords: element.kind === 'phrase' ? [...element.carriers] : [said!.word],
    explained: [...ep.explained],
    fails: ep.fails,
    takes: ep.takes,
  };
}

/**
 * The state after a take (§5.2, Q28):
 * - passed → the next judged member of a pair, else the next rung, else the next sound;
 * - missed → the same element again, up to `MAX_FAILS_PER_ELEMENT` measured misses; then the
 *   sound closes as not passed and the session goes on to the next one — no fourth try (§5.5);
 * - not measured → the same element again; it costs a take of `MAX_TAKES` and nothing else.
 * In the diagnostic each family is one word, measured once; a word not measured in
 * `MAX_DIAGNOSTIC_TAKES` leaves its family unknown. Its weak families become the drill.
 *
 * A done session does not move: the verdict is ignored, with no event.
 */
export function nextState(
  plan: SessionPlan,
  state: SessionState,
  verdict: TakeVerdict,
): { state: SessionState; events: StepEvent[] } {
  const s = clone(state);
  const events: StepEvent[] = [];
  if (s.phase === 'diagnostic') return diagnosticStep(plan, s, verdict, events);
  if (s.phase !== 'drill') return { state: s, events };

  const progress = s.sounds.find((p) => p.status === 'open');
  const sound = progress ? ladderFor(plan, progress.atomId) : null;
  const element = sound && progress ? sound.elements[progress.at] : undefined;
  const ep = progress?.elements[progress.at];
  if (!progress || !sound || !element || !ep) return finish(s, 'finished', events);

  s.takes += 1;
  ep.takes += 1;

  if (verdict.measured) {
    if (!verdict.passed && verdict.explained && verdict.key && !ep.explained.includes(verdict.key)) {
      ep.explained.push(verdict.key);
    }
    if (verdict.passed) {
      progress.passes += 1;
      const judged = element.kind === 'pair' ? element.judged : [0];
      const place = judged.indexOf(ep.side);
      if (element.kind === 'pair' && place >= 0 && place < judged.length - 1) {
        ep.side = judged[place + 1]!;
        events.push({ kind: 'side_passed', atomId: progress.atomId });
      } else {
        ep.status = 'passed';
        events.push({ kind: 'element_passed', atomId: progress.atomId });
        progress.at += 1;
        if (progress.at < sound.elements.length) {
          progress.elements.push(freshElement(sound.elements[progress.at]!));
        } else {
          progress.status = 'passed';
          events.push({ kind: 'sound_passed', atomId: progress.atomId });
          openNextSound(plan, s);
        }
      }
    } else {
      progress.fails += 1;
      ep.fails += 1;
      if (ep.fails >= MAX_FAILS_PER_ELEMENT) {
        ep.status = 'failed';
        progress.status = 'failed';
        progress.at = sound.elements.length;
        events.push({ kind: 'sound_failed', atomId: progress.atomId });
        openNextSound(plan, s);
      } else {
        events.push({ kind: 'retry', atomId: progress.atomId });
      }
    }
  } else {
    events.push({ kind: 'retry', atomId: progress.atomId });
  }

  if (!s.sounds.some((p) => p.status === 'open')) return finish(s, 'finished', events);
  if (s.takes >= MAX_TAKES) return finish(s, 'take_limit', events);
  return { state: s, events };
}

/**
 * The session ended from outside: the learner stopped, the payer may not go on, or ai-service
 * has heard all the takes it hears for one session (`take_limit`, its backstop — step 14.1).
 */
export function stopSession(
  state: SessionState,
  reason: Extract<DoneReason, 'stopped' | 'pool_empty' | 'not_available' | 'take_limit'>,
): { state: SessionState; events: StepEvent[] } {
  const s = clone(state);
  if (s.phase === 'done') return { state: s, events: [] };
  return finish(s, reason, []);
}

/**
 * Every take recorded so far, the diagnostic's included: what a client echoes with a take, so
 * that a take recorded for a step the session has already left is refused, not judged twice.
 */
export function takeIndex(state: SessionState): number {
  return state.takes + state.diagnostic.reduce((n, d) => n + d.takes, 0);
}

export type SoundRating = 'GOOD' | 'HARD' | 'AGAIN';

export interface SoundOutcome {
  atomId: string;
  status: SoundProgress['status'];
  passes: number;
  fails: number;
  /** Null — the session says nothing about this sound's card. */
  rating: SoundRating | null;
}

/**
 * One rating per sound of the session (Q28): passed with no measured miss — GOOD; passed after
 * misses — HARD; closed as not passed — AGAIN. A sound the session did not finish is rated on
 * what it measured: no miss — GOOD, misses after a pass — HARD, two misses and no pass — AGAIN.
 * A single miss and nothing else rates nothing: one noisy take must not reset a card.
 */
export function soundOutcomes(state: SessionState): SoundOutcome[] {
  return state.sounds.map((p) => ({
    atomId: p.atomId,
    status: p.status,
    passes: p.passes,
    fails: p.fails,
    rating: ratingOf(p),
  }));
}

/**
 * A rating on the 0–100 scale learning reads a gap's score by (`scoreToRating`: < 60 AGAIN,
 * < 80 HARD, < 95 GOOD) — each in the middle of its own band, so that the rating the session
 * decided is the rating that reaches the card (plan 86, step 13.5).
 */
export const RATING_SCORE: Readonly<Record<SoundRating, number>> = { GOOD: 90, HARD: 70, AGAIN: 0 };

/** A sound's rating as the attempt's event carries it: one gap per rated sound. */
export interface SoundGapResult {
  gapKey: string;
  correct: boolean;
  score: number;
  targets: Array<{ atomType: 'sound'; atomId: string; role: 'focus' }>;
}

/**
 * What a session tells the learner's memory (plan 86, step 13.5, Q28): each sound it rated, as a
 * gap keyed by the sound, about that sound alone (`focus`). A sound rated nothing — one miss, or
 * never reached — is left out: absent, not «failed». The diagnostic is never here (§5.5).
 */
export function soundGapResults(sounds: readonly SoundOutcome[]): SoundGapResult[] {
  return sounds.flatMap((sound) =>
    sound.rating === null
      ? []
      : [
          {
            gapKey: sound.atomId,
            correct: sound.rating !== 'AGAIN',
            score: RATING_SCORE[sound.rating],
            targets: [{ atomType: 'sound' as const, atomId: sound.atomId, role: 'focus' as const }],
          },
        ],
  );
}

/** The families the diagnostic heard as weak — flagged `ai_session`, never rated (§5.5). */
export function diagnosticWeak(state: SessionState): string[] {
  return state.diagnostic.filter((d) => d.status === 'weak').map((d) => d.atomId);
}

/**
 * The state with the sounds a take's remarks named beside its own target (plan 86, step 13.5b):
 * the take was judged on `target` alone, the others are heard on the way. A sound already noted
 * is not noted twice; the target never is — the session rates it, or it rated nothing (one miss).
 */
export function noteIncidental(state: SessionState, target: string, named: readonly string[]): SessionState {
  const incidental = [...(state.incidental ?? [])];
  for (const atomId of named) {
    if (atomId && atomId !== target && !incidental.includes(atomId)) incidental.push(atomId);
  }
  return { ...state, incidental };
}

/**
 * The sounds a handed-in session flags `ai_session` (plan 86, step 13.5b, Q28, Q31): the
 * diagnostic's weak families, then the sounds heard on the way — less every sound the session
 * rated, whose card has the measurement already; a flag too would pull a card just scheduled.
 * A weak family the session never reached stays flagged: the next session plans it (Q31, 2).
 */
export function sessionFlags(state: SessionState): string[] {
  const rated = new Set(soundOutcomes(state).filter((o) => o.rating !== null).map((o) => o.atomId));
  const flags: string[] = [];
  for (const atomId of [...diagnosticWeak(state), ...(state.incidental ?? [])]) {
    if (!rated.has(atomId) && !flags.includes(atomId)) flags.push(atomId);
  }
  return flags;
}

function ratingOf(p: SoundProgress): SoundRating | null {
  if (p.status === 'failed') return 'AGAIN';
  if (p.passes > 0) return p.fails === 0 ? 'GOOD' : 'HARD';
  return p.fails >= 2 ? 'AGAIN' : null;
}

function diagnosticStep(
  plan: SessionPlan,
  s: SessionState,
  verdict: TakeVerdict,
  events: StepEvent[],
): { state: SessionState; events: StepEvent[] } {
  const entry = s.diagnostic.find((d) => d.status === 'open');
  if (!entry) return endDiagnostic(plan, s, events);

  entry.takes += 1;
  if (verdict.measured) {
    entry.status = verdict.passed ? 'strong' : 'weak';
    events.push({ kind: 'diagnostic_measured', atomId: entry.atomId, weak: !verdict.passed });
  } else if (entry.takes >= MAX_DIAGNOSTIC_TAKES) {
    entry.status = 'unknown';
  }

  if (s.diagnostic.some((d) => d.status === 'open')) return { state: s, events };
  return endDiagnostic(plan, s, events);
}

function endDiagnostic(
  plan: SessionPlan,
  s: SessionState,
  events: StepEvent[],
): { state: SessionState; events: StepEvent[] } {
  const weak = diagnosticWeak(s);
  events.push({ kind: 'diagnostic_done', weak });
  const sounds = soundsAfterDiagnostic(plan, weak);
  if (sounds.length === 0) return finish(s, 'finished', events);
  const drill = openDrill(sounds, s.diagnostic, s.incidental ?? []);
  return { state: drill, events };
}

function openDrill(
  sounds: readonly PlannedSound[],
  diagnostic: DiagnosticProgress[],
  incidental: string[],
): SessionState {
  const progress: SoundProgress[] = sounds.map((sound, i) => ({
    atomId: sound.atomId,
    at: 0,
    elements: i === 0 && sound.elements[0] ? [freshElement(sound.elements[0])] : [],
    passes: 0,
    fails: 0,
    status: i === 0 ? 'open' : 'pending',
  }));
  return {
    phase: progress.length > 0 ? 'drill' : 'done',
    doneReason: progress.length > 0 ? null : 'finished',
    diagnostic,
    sounds: progress,
    takes: 0,
    incidental,
  };
}

/** Opens the first pending sound; its ladder's first element is set up when it opens. */
function openNextSound(plan: SessionPlan, s: SessionState): void {
  const next = s.sounds.find((p) => p.status === 'pending');
  if (!next) return;
  const first = ladderFor(plan, next.atomId)?.elements[0];
  next.status = 'open';
  next.at = 0;
  next.elements = first ? [freshElement(first)] : [];
}

function finish(
  s: SessionState,
  reason: DoneReason,
  events: StepEvent[],
): { state: SessionState; events: StepEvent[] } {
  s.phase = 'done';
  s.doneReason = reason;
  events.push({ kind: 'session_done', reason });
  return { state: s, events };
}

function freshElement(element: SessionElement): ElementProgress {
  return {
    side: element.kind === 'pair' ? (element.judged[0] ?? 0) : 0,
    takes: 0,
    fails: 0,
    explained: [],
    status: 'open',
  };
}

function ladderFor(plan: SessionPlan, atomId: string): PlannedSound | null {
  return (
    plan.sounds.find((s) => s.atomId === atomId) ??
    plan.candidates.find((s) => s.atomId === atomId) ??
    null
  );
}

function sayOf(element: SessionElement, side: number): MaterialWord | null {
  if (element.kind === 'word') return element.word;
  if (element.kind === 'pair') return element.words[side] ?? element.words[0];
  return null;
}

function judgeOf(family: string): Judge {
  return family === TONE_FAMILY ? 'toneme' : 'sounds';
}

function clone(state: SessionState): SessionState {
  return structuredClone(state);
}
