// The builder's mutations — every `set((e) => …)` of the prototype's steps, as pure functions.
//
// Each returns a new document and leaves the argument alone. Limits are enforced here, not in
// the buttons: 1–6 prompts, 2–5 criteria, 1–3 takes, preparation 0–120 s, a pass mark not below
// zero. A refused edit returns the document unchanged.

import { focusAt, wordKey } from './derive.js';
import type {
  Criterion,
  CriterionWeight,
  Mode,
  Prompt,
  ReadAloudContent,
  Recording,
  Review,
  Settings,
} from './model.js';
import {
  LEN,
  newCriterion,
  newId,
  newPrompt,
  RA_MAX_CRITERIA,
  RA_MAX_PREP_SECONDS,
  RA_MAX_PROMPTS,
  RA_MAX_TAKES,
  RA_MIN_CRITERIA,
} from './model.js';

type Doc = ReadAloudContent;

export function setTitle(ex: Doc, title: string): Doc {
  return { ...ex, title };
}

export function setInstruction(ex: Doc, instruction: string): Doc {
  return { ...ex, instruction };
}

/**
 * Switching the mode resets every prompt's three numbers to the new mode's defaults (`setMode`
 * of the prototype) and keeps every prompt's material: a read-aloud passage typed and then
 * switched away from comes back when the author switches back.
 */
export function setMode(ex: Doc, mode: Mode): Doc {
  if (mode === ex.mode) return ex;
  const len = LEN[mode];
  return {
    ...ex,
    mode,
    prompts: ex.prompts.map((p) => ({
      ...p,
      minSeconds: len.min,
      maxSeconds: len.max,
      prepSeconds: len.prep,
    })),
  };
}

export function addPrompt(ex: Doc): Doc {
  if (ex.prompts.length >= RA_MAX_PROMPTS) return ex;
  return { ...ex, prompts: [...ex.prompts, newPrompt(ex.mode)] };
}

export function removePrompt(ex: Doc, id: string): Doc {
  if (ex.prompts.length < 2) return ex;
  return { ...ex, prompts: ex.prompts.filter((p) => p.id !== id) };
}

export function setPrompt(ex: Doc, id: string, patch: Partial<Omit<Prompt, 'id'>>): Doc {
  return { ...ex, prompts: ex.prompts.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

function mapPrompt(ex: Doc, id: string, fn: (p: Prompt) => Prompt): Doc {
  return { ...ex, prompts: ex.prompts.map((p) => (p.id === id ? fn(p) : p)) };
}

/** Seconds fields take whole numbers; preparation is capped at two minutes, the others at nothing here. */
export function setSeconds(
  ex: Doc,
  id: string,
  field: 'minSeconds' | 'maxSeconds' | 'prepSeconds',
  value: number,
): Doc {
  const whole = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const v = field === 'prepSeconds' ? Math.min(whole, RA_MAX_PREP_SECONDS) : whole;
  return mapPrompt(ex, id, (p) => ({ ...p, [field]: v }));
}

// ── Plan points (monologue) ─────────────────────────────────────────────────

export function addPoint(ex: Doc, promptId: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({
    ...p,
    plan: [...p.plan, { id: newId(), text: '', required: true }],
  }));
}

export function setPointText(ex: Doc, promptId: string, pointId: string, text: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({
    ...p,
    plan: p.plan.map((x) => (x.id === pointId ? { ...x, text } : x)),
  }));
}

export function togglePointRequired(ex: Doc, promptId: string, pointId: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({
    ...p,
    plan: p.plan.map((x) => (x.id === pointId ? { ...x, required: !x.required } : x)),
  }));
}

export function removePoint(ex: Doc, promptId: string, pointId: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({ ...p, plan: p.plan.filter((x) => x.id !== pointId) }));
}

// ── Focus words and the note (step 2) ───────────────────────────────────────

/**
 * Tap a word of the passage: it becomes a focus word, or stops being one. Words are compared
 * without case — «Kjetil» at the start of a sentence and in the middle is one word to listen for.
 */
export function toggleFocusWord(ex: Doc, promptId: string, word: string): Doc {
  if (word.trim() === '') return ex;
  return mapPrompt(ex, promptId, (p) => {
    const hit = focusAt(p, word);
    return hit
      ? { ...p, focus: p.focus.filter((f) => f !== hit) }
      : { ...p, focus: [...p.focus, { id: newId(), word, note: '' }] };
  });
}

export function setFocusNote(ex: Doc, promptId: string, focusId: string, note: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({
    ...p,
    focus: p.focus.map((f) => (f.id === focusId ? { ...f, note } : f)),
  }));
}

export function removeFocus(ex: Doc, promptId: string, focusId: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({ ...p, focus: p.focus.filter((f) => f.id !== focusId) }));
}

export function setNote(ex: Doc, promptId: string, note: string): Doc {
  return mapPrompt(ex, promptId, (p) => ({ ...p, note }));
}

/** Whether a word of the passage is currently marked — for the step-2 buttons. */
export function isFocusWord(prompt: Prompt, word: string): boolean {
  return prompt.focus.some((f) => wordKey(f.word) === wordKey(word));
}

// ── Rubric (step 3) ─────────────────────────────────────────────────────────

function mapCriterion(ex: Doc, id: string, fn: (c: Criterion) => Criterion): Doc {
  return { ...ex, rubric: ex.rubric.map((c) => (c.id === id ? fn(c) : c)) };
}

export function addCriterion(ex: Doc): Doc {
  if (ex.rubric.length >= RA_MAX_CRITERIA) return ex;
  return { ...ex, rubric: [...ex.rubric, newCriterion()] };
}

/** At least two criteria stay: the prototype disables the bin below three. */
export function removeCriterion(ex: Doc, id: string): Doc {
  if (ex.rubric.length <= RA_MIN_CRITERIA) return ex;
  return { ...ex, rubric: ex.rubric.filter((c) => c.id !== id) };
}

export function setCriterion(
  ex: Doc,
  id: string,
  patch: Partial<Pick<Criterion, 'name' | 'desc'>>,
): Doc {
  return mapCriterion(ex, id, (c) => ({ ...c, ...patch }));
}

export function setWeight(ex: Doc, id: string, weight: CriterionWeight): Doc {
  return mapCriterion(ex, id, (c) => ({ ...c, weight }));
}

export function toggleStudentVisible(ex: Doc, id: string): Doc {
  return mapCriterion(ex, id, (c) => ({ ...c, studentVisible: !c.studentVisible }));
}

export function setLevel(ex: Doc, id: string, level: 0 | 1 | 2 | 3, text: string): Doc {
  return mapCriterion(ex, id, (c) => {
    const levels = [...c.levels] as [string, string, string, string];
    levels[level] = text;
    return { ...c, levels };
  });
}

export function setPassScore(ex: Doc, passScore: number): Doc {
  const v = Number.isFinite(passScore) ? Math.max(0, Math.round(passScore)) : 0;
  return { ...ex, settings: { ...ex.settings, passScore: v } };
}

// ── Dials ───────────────────────────────────────────────────────────────────

export function setRecording(ex: Doc, patch: Partial<Recording>): Doc {
  const next = { ...ex.recording, ...patch };
  next.takes = Math.min(RA_MAX_TAKES, Math.max(1, Math.round(next.takes)));
  return { ...ex, recording: next };
}

export function setSettings(ex: Doc, patch: Partial<Omit<Settings, 'passScore'>>): Doc {
  return { ...ex, settings: { ...ex.settings, ...patch } };
}

export function setReview(ex: Doc, patch: Partial<Omit<Review, 'ai'>>): Doc {
  return { ...ex, review: { ...ex.review, ...patch } };
}

export function setAi(ex: Doc, patch: Partial<Review['ai']>): Doc {
  return { ...ex, review: { ...ex.review, ai: { ...ex.review.ai, ...patch } } };
}
