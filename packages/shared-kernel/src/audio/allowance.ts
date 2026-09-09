// The playback rules — plan 56 §3.2, from BEHAVIOR.md §5–§8.
//
// The handoff is emphatic that these rules live "in the engine, not in the views", and
// its engine is a React hook around an `HTMLAudioElement`. This file is that engine with
// the element taken out: a reducer over playback events, with no DOM, no timers and no
// framework. Three reasons it is shaped that way rather than ported as a hook:
//
//   1. The web plays through `HTMLAudioElement` and VoxOrd through `react-native-sound`,
//      which has no time events at all and must be polled. One rule set, two adapters —
//      and the reducer cannot tell which of them produced a `time` event.
//   2. "An attempt is spent starting from the top" is a judgement about fairness to a
//      student, and judgements on this platform are tested without a renderer.
//   3. The server may one day count listens (§3.6). When it does, it replays these same
//      events; a hook could not have been reused.
//
// What it deliberately does **not** hold: the position of the audio element. It holds
// what it was last *told* the position is, and answers with an effect describing what the
// adapter should do to the element. The element remains the single source of truth about
// itself.

import type { AudioSettings, ItemAudio } from './model.js';

export interface AllowanceState {
  /** Last reported position, seconds. */
  pos: number;
  playing: boolean;
  /** Listens spent. Counts starts from the top, never resumes (BEHAVIOR §6). */
  plays: number;
  /** Playthroughs that reached the end. `heard` is derived from it. */
  completed: number;
  /** The fragment being played, if any. Playing one is always free. */
  range: ItemAudio | null;
}

export const INITIAL_STATE: AllowanceState = {
  pos: 0,
  playing: false,
  plays: 0,
  completed: 0,
  range: null,
};

/** What the adapter should do to its element after a step. */
export interface PlaybackEffect {
  /** Move the element here first, or leave it where it is. */
  seekTo: number | null;
  /** Start it, stop it, or leave it. */
  transport: 'play' | 'pause' | null;
}

const NOTHING: PlaybackEffect = { seekTo: null, transport: null };

export type AllowanceEvent =
  /** The student pressed play. May be refused, may spend a listen, may resume. */
  | { type: 'play' }
  | { type: 'pause' }
  /** The element reported a position. In VoxOrd this is a poll, in the browser an event. */
  | { type: 'time'; pos: number }
  /** The element reached the end of the clip. */
  | { type: 'ended' }
  /** Scrub or skip. A no-op when the teacher turned seeking off. */
  | { type: 'seek'; to: number }
  /** Play one fragment. Never spends a listen, never counts as a playthrough. */
  | { type: 'playRange'; start: number; end: number }
  /** Back to the beginning of everything: a restart is a new attempt. */
  | { type: 'reset' };

export interface AllowanceContext {
  settings: AudioSettings;
  /** The clip length. `0` means unknown — see `model.ts` on why it is only a hint. */
  duration: number;
}

export interface AllowanceStep {
  state: AllowanceState;
  effect: PlaybackEffect;
}

/** Listens allowed. `0` is unlimited, and is the default. */
export function limitOf(settings: AudioSettings): number {
  return settings.plays;
}

/** No listens left. Does not stop a playthrough already running (BEHAVIOR §6). */
export function isExhausted(state: AllowanceState, settings: AudioSettings): boolean {
  const limit = limitOf(settings);
  return limit > 0 && state.plays >= limit;
}

/** One complete playthrough has happened. This, and only this, opens a `first` gate. */
export function hasHeard(state: AllowanceState): boolean {
  return state.completed > 0;
}

/**
 * Are the items locked?
 *
 * Note what is *not* here: whether the clip could be loaded. A player that cannot play
 * must not leave the exercise unanswerable (BEHAVIOR §11), so the caller passes its own
 * failure in and the gate opens — the transcript opens with it, in the runner.
 */
export function isGated(
  state: AllowanceState,
  settings: AudioSettings,
  options: { playable?: boolean } = {},
): boolean {
  if (options.playable === false) return false;
  return settings.gate === 'first' && !hasHeard(state);
}

/** At the top: pressing play here starts a new listen and spends one. */
function atTop(state: AllowanceState, duration: number): boolean {
  if (state.pos <= 0.05) return true;
  // The end counts as the top, because playing from there restarts the clip.
  return duration > 0 && state.pos >= duration - 0.05;
}

function clamp(value: number, duration: number): number {
  const upper = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(value, 0), upper);
}

/**
 * One step of the machine.
 *
 * Returns the state *and* what to do about it, rather than mutating an element, so the
 * same call can be made from a browser hook, a React Native poll loop, or a test with
 * neither.
 */
export function step(
  state: AllowanceState,
  event: AllowanceEvent,
  ctx: AllowanceContext,
): AllowanceStep {
  const { settings, duration } = ctx;

  switch (event.type) {
    case 'play': {
      const starting = atTop(state, duration);

      /*
        Refused only when the next press would *start* something. A student who paused
        halfway through their last allowed listen gets to finish it: the allowance table
        (BEHAVIOR §6) prices a resume at nothing, and a limit that punished pausing would
        be teaching students not to pause rather than to listen carefully. Departure from
        the letter of the player-state table (§5, "exhausted and stopped → disabled"),
        recorded in plan 56 §5.
      */
      if (starting && isExhausted(state, settings)) {
        return { state, effect: NOTHING };
      }

      if (starting) {
        return {
          state: { ...state, pos: 0, playing: true, plays: state.plays + 1, range: null },
          effect: { seekTo: 0, transport: 'play' },
        };
      }

      return {
        state: { ...state, playing: true },
        effect: { seekTo: null, transport: 'play' },
      };
    }

    case 'pause':
      if (!state.playing) return { state, effect: NOTHING };
      return { state: { ...state, playing: false }, effect: { seekTo: null, transport: 'pause' } };

    case 'time': {
      const pos = clamp(event.pos, duration);
      // The end of a fragment is a stop, not the end of the clip: no playthrough is
      // completed, no listen is spent, and the position stays where it stopped.
      if (state.range !== null && pos >= state.range.end) {
        return {
          state: { ...state, pos: state.range.end, playing: false, range: null },
          effect: { seekTo: null, transport: 'pause' },
        };
      }
      return { state: { ...state, pos }, effect: NOTHING };
    }

    case 'ended':
      return {
        state: {
          ...state,
          pos: duration,
          playing: false,
          range: null,
          // A fragment that runs to the end of the clip is still not a playthrough: the
          // student heard from 0:22, not from the start.
          completed: state.range === null ? state.completed + 1 : state.completed,
        },
        effect: NOTHING,
      };

    case 'seek': {
      if (!settings.seek) return { state, effect: NOTHING };
      const pos = clamp(event.to, duration);
      return { state: { ...state, pos, range: null }, effect: { seekTo: pos, transport: null } };
    }

    case 'playRange': {
      const start = clamp(event.start, duration);
      const end = clamp(event.end, duration);
      // An inverted or empty range is authoring damage, warned about in `issues.ts`. The
      // student's chip does nothing rather than playing the whole clip at their expense.
      if (end <= start) return { state, effect: NOTHING };
      return {
        state: { ...state, pos: start, playing: true, range: { start, end } },
        effect: { seekTo: start, transport: 'play' },
      };
    }

    case 'reset':
      return { state: { ...INITIAL_STATE }, effect: { seekTo: 0, transport: 'pause' } };
  }
}

/**
 * Whether the play button should respond at all.
 *
 * The same rule as the refusal inside `step`, exposed so a view can grey the button out
 * instead of offering a press that does nothing.
 */
export function canPlay(
  state: AllowanceState,
  ctx: AllowanceContext,
  options: { interactive?: boolean } = {},
): boolean {
  if (options.interactive === false) return false;
  if (state.playing) return true;
  return !(atTop(state, ctx.duration) && isExhausted(state, ctx.settings));
}
