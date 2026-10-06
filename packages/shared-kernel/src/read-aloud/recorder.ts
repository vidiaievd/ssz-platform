// The recorder as a state machine — README build order item 1: «Recorder state machine and
// limits (`mic → idle → prep → rec → review`), shared by web and VoxOrd. Pure, testable, no UI.»
//
// `(state, event) → state`, with no timer, no microphone and no clock inside. The adapters own
// the hardware and time: they dispatch `tick` once a second while a phase that counts is on, feed
// `level` from the microphone, and when the machine asks for the recording to end (`stopping`)
// they stop the recorder and answer with `stopped`, carrying their reference to the bytes. VoxOrd
// carries a byte-for-byte copy of this file, as it does the audio model (plan 56, phase 7).
//
// The phases are the prototype's, plus the ones README calls «real states and none of them exist
// today» — and one the documents asked for and the prototype folded into another:
//
//   mic       the level check before the first prompt (`micCheck`)
//   idle      ready to record this prompt; `review` is the same screen after a take
//   prep      preparation, counting down `prepSeconds` (DECISIONS §7 — always, when non-zero)
//   count     3 · 2 · 1 before the microphone opens (`countdown` — plan 70 §4.2 item 1)
//   rec       recording, stopped by the student, by the prompt's maximum or by the hard ceiling
//   stopping  the machine asked the adapter to stop and waits for the bytes
//   denied    the browser or the phone refused the microphone
//   noDevice  there is no microphone to ask for
//
// An interruption — the track ended, the device changed, a call came in, the page went to the
// background — returns to `idle` with a notice and **no take**: it was not the student's attempt,
// and it does not spend one (plan 70 §8 item 4).
//
// A take the server refused at hand-in — its file gone, broken, or of a length the server measured
// outside the prompt's range — is taken back the same way (`refused`): the student did record, but
// what reached the teacher would be nothing, and a budget spent on nothing locks the prompt with
// no way out (decided 06.10, phase 6 follow-up).

import { recordLimit } from './limits.js';
import type { Recording } from './model.js';

export type Phase =
  | 'mic'
  | 'idle'
  | 'prep'
  | 'count'
  | 'rec'
  | 'stopping'
  | 'review'
  | 'denied'
  | 'noDevice';

export type UploadState = 'pending' | 'done' | 'failed';

export interface Take {
  /**
   * 1-based, in the order recorded, unique within its prompt — an identity, not a position: a
   * refused take leaves a gap. Screens number takes by their place in the list.
   */
  n: number;
  seconds: number;
  /** The adapter's handle on the bytes (`blob:` URL, file path); null once restored from a draft. */
  ref: string | null;
  /** Set once the upload has been accepted. */
  assetId: string | null;
  upload: UploadState;
}

export interface RecorderPrompt {
  id: string;
  minSeconds: number;
  maxSeconds: number;
  prepSeconds: number;
}

export interface RecorderConfig {
  prompts: readonly RecorderPrompt[];
  recording: Recording;
}

export type Notice = 'interrupted' | null;

export interface RecorderState {
  phase: Phase;
  /** The prompt on screen. */
  index: number;
  /** Whole seconds into the current counting phase. */
  t: number;
  /** The level check has been passed or dismissed. */
  micChecked: boolean;
  micHeardMs: number;
  micSilentMs: number;
  notice: Notice;
  /** Keyed by prompt id. */
  takes: Readonly<Record<string, readonly Take[]>>;
  /** Index into `takes[id]` the student picked. Absent — the last one. */
  chosen: Readonly<Record<string, number>>;
}

export type RecorderEvent =
  | { type: 'level'; value: number; ms: number }
  | { type: 'ready' }
  | { type: 'begin' }
  | { type: 'tick' }
  | { type: 'startNow' }
  | { type: 'stop' }
  | { type: 'stopped'; ref: string | null; seconds?: number }
  | { type: 'interrupted' }
  | { type: 'denied' }
  | { type: 'noDevice' }
  | { type: 'retry' }
  | { type: 'choose'; index: number }
  | { type: 'goto'; index: number }
  | { type: 'uploaded'; itemId: string; n: number; assetId: string }
  | { type: 'uploadFailed'; itemId: string; n: number }
  | { type: 'uploadRetry'; itemId: string; n: number }
  /** The server would not take this take at hand-in; it goes, and its slot is given back. */
  | { type: 'refused'; itemId: string; n: number }
  | {
      type: 'restore';
      takes: Record<string, { n: number; seconds: number; assetId: string }[]>;
      chosen: Record<string, number>;
    }
  | { type: 'reset' };

/** A level, 0..1, above which the microphone counts as hearing something. */
export const MIC_LEVEL_THRESHOLD = 0.08;
/** How long it has to hear something for the check to pass. */
export const MIC_OK_MS = 300;
/** How long it may hear nothing before the check says so (plan 70, Q7-A). */
export const MIC_SILENT_MS = 5000;
export const COUNTDOWN_SECONDS = 3;
/** The clock turns to a warning this many seconds before the prompt's maximum. */
export const CLOCK_WARN_SECONDS = 10;

export function initialState(config: RecorderConfig): RecorderState {
  return {
    phase: config.recording.micCheck ? 'mic' : 'idle',
    index: 0,
    t: 0,
    micChecked: !config.recording.micCheck,
    micHeardMs: 0,
    micSilentMs: 0,
    notice: null,
    takes: {},
    chosen: {},
  };
}

const COUNTING: readonly Phase[] = ['prep', 'count', 'rec', 'stopping'];

export function reduce(
  state: RecorderState,
  event: RecorderEvent,
  config: RecorderConfig,
): RecorderState {
  const prompt = config.prompts[state.index];

  switch (event.type) {
    case 'level': {
      if (state.phase !== 'mic' || micOk(state)) return state;
      return event.value >= MIC_LEVEL_THRESHOLD
        ? { ...state, micHeardMs: state.micHeardMs + event.ms }
        : { ...state, micSilentMs: state.micSilentMs + event.ms };
    }

    case 'ready':
      return state.phase === 'mic' ? { ...state, phase: 'idle', micChecked: true, t: 0 } : state;

    case 'begin': {
      if (!prompt || (state.phase !== 'idle' && state.phase !== 'review')) return state;
      if (left(state, config, prompt.id) <= 0) return state;
      return { ...state, phase: afterIdle(prompt, config), t: 0, notice: null };
    }

    case 'tick': {
      if (!prompt) return state;
      const t = state.t + 1;
      if (state.phase === 'prep') {
        return t >= prompt.prepSeconds
          ? { ...state, phase: afterPrep(config), t: 0 }
          : { ...state, t };
      }
      if (state.phase === 'count') {
        return t >= COUNTDOWN_SECONDS ? { ...state, phase: 'rec', t: 0 } : { ...state, t };
      }
      if (state.phase === 'rec') {
        return t >= recordLimit(prompt.maxSeconds)
          ? { ...state, phase: 'stopping', t }
          : { ...state, t };
      }
      return state;
    }

    case 'startNow':
      return state.phase === 'prep' ? { ...state, phase: afterPrep(config), t: 0 } : state;

    case 'stop':
      return state.phase === 'rec' ? { ...state, phase: 'stopping' } : state;

    case 'stopped': {
      if (!prompt || (state.phase !== 'rec' && state.phase !== 'stopping')) return state;
      const own = state.takes[prompt.id] ?? [];
      const seconds = clampSeconds(event.seconds ?? state.t, prompt.maxSeconds);
      const take: Take = {
        n: nextTakeNumber(own),
        seconds,
        ref: event.ref,
        assetId: null,
        upload: 'pending',
      };
      return {
        ...state,
        phase: 'review',
        t: 0,
        takes: { ...state.takes, [prompt.id]: [...own, take] },
        // The newest take is the one on offer until the student picks another (`pick` of the prototype).
        chosen: { ...state.chosen, [prompt.id]: own.length },
      };
    }

    case 'interrupted':
      return COUNTING.includes(state.phase)
        ? { ...state, phase: 'idle', t: 0, notice: 'interrupted' }
        : state;

    case 'denied':
    case 'noDevice':
      return { ...state, phase: event.type, t: 0 };

    case 'retry':
      return state.phase === 'denied' || state.phase === 'noDevice'
        ? { ...state, phase: state.micChecked ? 'idle' : 'mic', t: 0, micHeardMs: 0, micSilentMs: 0 }
        : state;

    case 'choose': {
      if (!prompt || !config.recording.chooseBest) return state;
      if (state.phase !== 'idle' && state.phase !== 'review') return state;
      const own = state.takes[prompt.id] ?? [];
      if (event.index < 0 || event.index >= own.length) return state;
      return { ...state, chosen: { ...state.chosen, [prompt.id]: event.index } };
    }

    case 'goto': {
      if (COUNTING.includes(state.phase)) return state;
      if (event.index < 0 || event.index >= config.prompts.length || event.index === state.index) {
        return state;
      }
      const phase = state.phase === 'review' ? 'idle' : state.phase;
      return { ...state, index: event.index, phase, t: 0, notice: null };
    }

    case 'uploaded':
      return patchTake(state, event.itemId, event.n, { assetId: event.assetId, upload: 'done' });
    case 'uploadFailed':
      return patchTake(state, event.itemId, event.n, { upload: 'failed' });
    case 'uploadRetry':
      return patchTake(state, event.itemId, event.n, { upload: 'pending' });

    case 'refused': {
      if (COUNTING.includes(state.phase)) return state;
      const own = state.takes[event.itemId] ?? [];
      const at = own.findIndex((t) => t.n === event.n);
      if (at < 0) return state;
      const rest = own.filter((_, i) => i !== at);
      const takes = { ...state.takes };
      if (rest.length > 0) takes[event.itemId] = rest;
      else delete takes[event.itemId];
      const chosen = { ...state.chosen };
      const picked = chosen[event.itemId];
      // The pick follows its take; a refused pick falls back to the default — the last one.
      if (picked === undefined || picked === at || rest.length === 0) delete chosen[event.itemId];
      else if (picked > at) chosen[event.itemId] = picked - 1;
      return { ...state, takes, chosen };
    }

    case 'restore': {
      const takes: Record<string, Take[]> = {};
      for (const p of config.prompts) {
        const saved = event.takes[p.id];
        if (!saved || saved.length === 0) continue;
        takes[p.id] = saved.slice(0, config.recording.takes).map((s, i) => ({
          n: i + 1,
          seconds: s.seconds,
          ref: null,
          assetId: s.assetId,
          upload: 'done',
        }));
      }
      const chosen: Record<string, number> = {};
      for (const [id, index] of Object.entries(event.chosen)) {
        const own = takes[id];
        if (own && Number.isInteger(index) && index >= 0 && index < own.length) chosen[id] = index;
      }
      const any = Object.keys(takes).length > 0;
      return {
        ...state,
        takes,
        chosen,
        // A student coming back to takes already made has been through the check.
        phase: any ? 'idle' : state.phase,
        micChecked: state.micChecked || any,
      };
    }

    case 'reset':
      return initialState(config);
  }
}

/** The number the next take at a prompt gets — past the highest, so a gap is never reused. */
export function nextTakeNumber(own: readonly Take[]): number {
  return own.reduce((n, t) => Math.max(n, t.n), 0) + 1;
}

function afterIdle(prompt: RecorderPrompt, config: RecorderConfig): Phase {
  return prompt.prepSeconds > 0 ? 'prep' : afterPrep(config);
}

function afterPrep(config: RecorderConfig): Phase {
  return config.recording.countdown ? 'count' : 'rec';
}

function clampSeconds(seconds: number, maxSeconds: number): number {
  const s = Number.isFinite(seconds) ? seconds : 0;
  return Math.min(Math.max(1, Math.round(s * 10) / 10), recordLimit(maxSeconds));
}

function patchTake(
  state: RecorderState,
  itemId: string,
  n: number,
  patch: Partial<Take>,
): RecorderState {
  const own = state.takes[itemId];
  if (!own || !own.some((t) => t.n === n)) return state;
  return {
    ...state,
    takes: { ...state.takes, [itemId]: own.map((t) => (t.n === n ? { ...t, ...patch } : t)) },
  };
}

// ── Selectors ──────────────────────────────────────────────────────────────

/** The level check has heard enough. */
export function micOk(state: RecorderState): boolean {
  return state.micHeardMs >= MIC_OK_MS;
}

/** The level check has heard nothing for a while (Q7-A). It advises; «Klar» stays available. */
export function micSilent(state: RecorderState): boolean {
  return !micOk(state) && state.micSilentMs >= MIC_SILENT_MS;
}

export function takesOf(state: RecorderState, itemId: string): readonly Take[] {
  return state.takes[itemId] ?? [];
}

/** Takes left at the microphone for a prompt. */
export function left(state: RecorderState, config: RecorderConfig, itemId: string): number {
  return Math.max(0, config.recording.takes - takesOf(state, itemId).length);
}

/** The take that will be sent: the student's pick under `chooseBest`, the last one otherwise. */
export function chosenIndex(state: RecorderState, config: RecorderConfig, itemId: string): number {
  const own = takesOf(state, itemId);
  if (own.length === 0) return -1;
  const picked = state.chosen[itemId];
  if (config.recording.chooseBest && picked !== undefined && picked >= 0 && picked < own.length) {
    return picked;
  }
  return own.length - 1;
}

export function chosenTake(
  state: RecorderState,
  config: RecorderConfig,
  itemId: string,
): Take | null {
  return takesOf(state, itemId)[chosenIndex(state, config, itemId)] ?? null;
}

export function isShort(take: Take, prompt: RecorderPrompt): boolean {
  return take.seconds < prompt.minSeconds;
}

/**
 * Prompts whose chosen take is under their minimum — over **every** prompt, not just the one on
 * screen (the prototype's own comment): a short recording three prompts back blocks the submit
 * as surely as one in view.
 */
export function shortOnes(state: RecorderState, config: RecorderConfig): string[] {
  return config.prompts
    .filter((p) => {
      const take = chosenTake(state, config, p.id);
      return take !== null && isShort(take, p);
    })
    .map((p) => p.id);
}

export function recordedCount(state: RecorderState, config: RecorderConfig): number {
  return config.prompts.filter((p) => takesOf(state, p.id).length > 0).length;
}

/** The takes that go to the teacher for a prompt — the chosen one, and the rest under `keepAllTakes`. */
export function sentTakes(state: RecorderState, config: RecorderConfig, itemId: string): Take[] {
  const own = takesOf(state, itemId);
  if (config.recording.keepAllTakes) return [...own];
  const take = chosenTake(state, config, itemId);
  return take ? [take] : [];
}

/** Takes that must finish uploading before the submission can go. */
export function uploadsPending(state: RecorderState, config: RecorderConfig): number {
  return config.prompts
    .flatMap((p) => sentTakes(state, config, p.id))
    .filter((t) => t.upload !== 'done' || t.assetId === null).length;
}

export type SubmitBlock = 'unrecorded' | 'short' | 'uploading' | null;

/** Why «Lever til læreren» is off, in the order the runner says it — or null when it is on. */
export function submitBlock(state: RecorderState, config: RecorderConfig): SubmitBlock {
  if (config.prompts.length === 0) return 'unrecorded';
  if (recordedCount(state, config) < config.prompts.length) return 'unrecorded';
  if (shortOnes(state, config).length > 0) return 'short';
  if (uploadsPending(state, config) > 0) return 'uploading';
  return null;
}

export function canSubmit(state: RecorderState, config: RecorderConfig): boolean {
  return submitBlock(state, config) === null;
}

/** What the big clock shows: preparation and the countdown count down, recording counts up. */
export function clockSeconds(state: RecorderState, prompt: RecorderPrompt): number {
  if (state.phase === 'prep') return Math.max(0, prompt.prepSeconds - state.t);
  if (state.phase === 'count') return Math.max(0, COUNTDOWN_SECONDS - state.t);
  return state.t;
}

/** The clock turns amber in the last seconds of a recording. */
export function clockWarns(state: RecorderState, prompt: RecorderPrompt): boolean {
  return state.phase === 'rec' && state.t > recordLimit(prompt.maxSeconds) - CLOCK_WARN_SECONDS;
}

/** Share of the prompt's maximum used, 0..1 — the bar under the meter. */
export function recordedShare(state: RecorderState, prompt: RecorderPrompt): number {
  return Math.min(1, state.t / recordLimit(prompt.maxSeconds));
}

/** Whether a phase has the adapter's clock running. */
export function ticking(phase: Phase): boolean {
  return phase === 'prep' || phase === 'count' || phase === 'rec';
}
