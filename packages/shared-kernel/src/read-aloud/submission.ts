// What a `read_aloud` attempt carries to the server: the draft while takes are being made, the
// submission when they are handed in (plan 70 §3.4–3.5).
//
//   draft      { takes: { [itemId]: [{ n, assetId, seconds }] }, chosen: { [itemId]: index } }
//   submission { recordings: [{ itemId, assetId, seconds, takes, discarded? }] }
//
// The draft holds only uploaded takes — a take still on the device has no id the server could
// ever resolve. The submission holds the take the student chose for each prompt (the last one
// without `chooseBest`), and the others only under `keepAllTakes` (DECISIONS §1: «Only the chosen
// take is sent by default»). Readers coerce and drop; a malformed entry is not a recording.

import type { RecorderConfig, RecorderState } from './recorder.js';
import { chosenIndex, takesOf } from './recorder.js';

export interface SubmittedTake {
  assetId: string;
  seconds: number;
}

export interface SubmittedRecording {
  itemId: string;
  assetId: string;
  seconds: number;
  /** How many takes the student made at this prompt — the queue's «N opptak». */
  takes: number;
  /** The takes not chosen — only under `keepAllTakes`. */
  discarded?: SubmittedTake[];
}

export interface Submission {
  recordings: SubmittedRecording[];
}

export interface DraftTake {
  n: number;
  assetId: string;
  seconds: number;
}

export interface Draft {
  takes: Record<string, DraftTake[]>;
  chosen: Record<string, number>;
}

/** The uploaded part of the recorder's state, for the attempt's draft. */
export function toDraft(state: RecorderState): Draft {
  const takes: Record<string, DraftTake[]> = {};
  for (const [itemId, own] of Object.entries(state.takes)) {
    const uploaded = own.flatMap((t) =>
      t.upload === 'done' && t.assetId !== null ? [{ n: t.n, assetId: t.assetId, seconds: t.seconds }] : [],
    );
    if (uploaded.length > 0) takes[itemId] = uploaded;
  }
  const chosen: Record<string, number> = {};
  for (const [itemId, index] of Object.entries(state.chosen)) {
    if (takes[itemId] && index < takes[itemId].length) chosen[itemId] = index;
  }
  return { takes, chosen };
}

/**
 * The submission from a finished recorder. Returns null when a prompt has no uploaded chosen
 * take — the runner keeps the button off until it does (`submitBlock`).
 */
export function toSubmission(state: RecorderState, config: RecorderConfig): Submission | null {
  const recordings: SubmittedRecording[] = [];
  for (const p of config.prompts) {
    const own = takesOf(state, p.id);
    const index = chosenIndex(state, config, p.id);
    const chosen = own[index];
    if (!chosen || chosen.assetId === null) return null;
    const recording: SubmittedRecording = {
      itemId: p.id,
      assetId: chosen.assetId,
      seconds: chosen.seconds,
      takes: own.length,
    };
    if (config.recording.keepAllTakes) {
      const discarded = own.filter((_, i) => i !== index);
      if (discarded.some((t) => t.assetId === null)) return null;
      if (discarded.length > 0) {
        recording.discarded = discarded.map((t) => ({ assetId: t.assetId as string, seconds: t.seconds }));
      }
    }
    recordings.push(recording);
  }
  return { recordings };
}

/** The asset ids of takes the student made and the teacher will not hear — deleted after submitting. */
export function unsentAssets(state: RecorderState, submission: Submission): string[] {
  const sent = new Set<string>();
  for (const r of submission.recordings) {
    sent.add(r.assetId);
    for (const d of r.discarded ?? []) sent.add(d.assetId);
  }
  return Object.values(state.takes)
    .flat()
    .flatMap((t) => (t.assetId !== null && !sent.has(t.assetId) ? [t.assetId] : []));
}

function rec(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function take(value: unknown): SubmittedTake | null {
  const t = rec(value);
  if (!t) return null;
  const { assetId, seconds } = t;
  if (typeof assetId !== 'string' || assetId === '') return null;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  return { assetId, seconds };
}

/** A submission off a request or a column; null when it is not one at all. */
export function readSubmission(value: unknown): Submission | null {
  const s = rec(value);
  if (!s || !Array.isArray(s['recordings'])) return null;
  const recordings: SubmittedRecording[] = [];
  for (const raw of s['recordings']) {
    const r = rec(raw);
    const base = take(raw);
    if (!r || !base || typeof r['itemId'] !== 'string' || r['itemId'] === '') return null;
    const takes = typeof r['takes'] === 'number' && Number.isInteger(r['takes']) ? r['takes'] : 1;
    const recording: SubmittedRecording = { itemId: r['itemId'], ...base, takes: Math.max(1, takes) };
    if (Array.isArray(r['discarded'])) {
      const discarded = r['discarded'].map(take);
      if (discarded.some((d) => d === null)) return null;
      if (discarded.length > 0) recording.discarded = discarded as SubmittedTake[];
    }
    recordings.push(recording);
  }
  return { recordings };
}

/** A draft off a column; anything unreadable is left out, never thrown. */
export function readDraft(value: unknown): Draft {
  const d = rec(value);
  const takes: Draft['takes'] = {};
  const chosen: Draft['chosen'] = {};
  for (const [itemId, raw] of Object.entries(rec(d?.['takes']) ?? {})) {
    if (!Array.isArray(raw)) continue;
    const own = raw.flatMap((x): DraftTake[] => {
      const t = take(x);
      const n = rec(x)?.['n'];
      return t && typeof n === 'number' && Number.isInteger(n) ? [{ n, ...t }] : [];
    });
    if (own.length > 0) takes[itemId] = own;
  }
  for (const [itemId, index] of Object.entries(rec(d?.['chosen']) ?? {})) {
    if (typeof index === 'number' && Number.isInteger(index) && index >= 0) chosen[itemId] = index;
  }
  return { takes, chosen };
}
