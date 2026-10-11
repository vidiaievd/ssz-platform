// The validation engine for `information_transfer` (`infIssues` of the prototype; plan 73 §4.3).
//
// One list drives the rail dots, the inline messages, the gate and the content-service publish
// preflight. Issues carry a code and the parameters a message needs, never the message — the
// teacher UI is in four languages. An issue about one field names it by id; the message says
// «Field N («label»)» by its place.
//
// Blockers only for what makes the blank unplayable or teaches the wrong thing (spec 19 §1.2):
// no source, an unanswerable or ungradable cell, a missing explanation (DECISIONS §3), a key the
// core cannot read (DECISIONS §1), a written source hidden while answering (DECISIONS §5).
//
// ── The audio layer's share ─────────────────────────────────────────────────
// With a recording, the layer's own `audioIssues` apply unchanged, placed on this builder's steps
// (`AUDIO_STEPS` — the prototype's `{ source: 1, rules: 4, transcript: 1, segments: 2 }`). The
// type adds one rule of its own the way `error_correction` does: the transcript is a blocker here,
// because every content check of step 2 reads it (README, step 1).

import type { AudioIssue, AudioStepMap, PlacedAudioIssue } from '../audio/issues.js';
import { audioIssues, placeAudioIssues } from '../audio/issues.js';
import { expectedOf, packOf, readyFields, sourceText, inSource } from './derive.js';
import { canon, normText, timeCandidates } from './formats.js';
import { keyPasses } from './grading.js';
import type { FieldType, InformationTransferContent } from './model.js';
import { isFormatType, isLexicalType, MAX_FIELDS, MIN_FIELDS } from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. */
export type IssueStep = 1 | 2 | 3 | 4 | 5;

export type Issue =
  // ── Step 1 — the source ──
  | { code: 'INF_NO_PASSAGE'; level: 'blocker'; step: 1 }
  | { code: 'INF_NO_TRANSCRIPT'; level: 'blocker'; step: 1 }
  | { code: 'INF_NO_TITLE'; level: 'warning'; step: 1 }
  | { code: 'INF_NO_INSTRUCTION'; level: 'warning'; step: 1 }
  | { code: 'INF_NO_PACK'; level: 'warning'; step: 1; language: string }
  // ── Step 2 — the blank ──
  | { code: 'INF_NO_FIELDS'; level: 'blocker'; step: 2 }
  | { code: 'INF_FIELD_NO_LABEL'; level: 'blocker'; step: 2; fieldId: string; n: number }
  | { code: 'INF_DUPLICATE_LABEL'; level: 'warning'; step: 2; fieldId: string; n: number; label: string }
  | { code: 'INF_FIELD_NO_KEY'; level: 'blocker'; step: 2; fieldId: string; n: number; label: string }
  | { code: 'INF_FIELD_NO_WHY'; level: 'blocker'; step: 2; fieldId: string; n: number; label: string }
  | {
      code: 'INF_KEY_NOT_IN_SOURCE';
      level: 'warning';
      step: 2;
      fieldId: string;
      n: number;
      label: string;
      value: string;
    }
  | { code: 'INF_SENTENCE_ANSWER'; level: 'warning'; step: 2; fieldId: string; n: number; label: string }
  | { code: 'INF_FEW_FIELDS'; level: 'warning'; step: 2; count: number; min: number }
  | { code: 'INF_MANY_FIELDS'; level: 'warning'; step: 2; count: number; max: number }
  | { code: 'INF_ALL_FREE_TEXT'; level: 'info'; step: 2 }
  // ── Step 3 — what counts as the same answer ──
  | {
      code: 'INF_KEY_UNREADABLE';
      level: 'blocker';
      step: 3;
      fieldId: string;
      n: number;
      label: string;
      value: string;
      type: FieldType;
    }
  | {
      code: 'INF_TIME_AMBIGUOUS';
      level: 'info';
      step: 3;
      fieldId: string;
      n: number;
      label: string;
      value: string;
      /** The 24-hour form to write instead: «17:30». */
      suggestion: string;
    }
  | { code: 'INF_KEY_FAILS_GRADER'; level: 'blocker'; step: 3 }
  | { code: 'INF_TYPOS_ON'; level: 'info'; step: 3 }
  | { code: 'INF_SPELLED_OFF'; level: 'info'; step: 3 }
  | { code: 'INF_CASE_SENSITIVE'; level: 'warning'; step: 3 }
  // ── Step 4 — delivery ──
  | { code: 'INF_ONE_PLAY_MANY'; level: 'warning'; step: 4; count: number }
  | { code: 'INF_NO_SEGMENTS'; level: 'info'; step: 4; count: number }
  | { code: 'INF_SOURCE_HIDDEN'; level: 'blocker'; step: 4 }
  // ── Step 5 — result and memory ──
  | { code: 'INF_PASS_TOO_HIGH'; level: 'warning'; step: 5; pct: number; count: number }
  | { code: 'INF_REQUIRED_ALL'; level: 'info'; step: 5 }
  | { code: 'INF_NO_MEMORY'; level: 'info'; step: 5 }
  /** The skill atom has no review card until plan 63 phase 7 — not live (plan 73 §3.9). */
  | { code: 'INF_SKILL_CARD_LATER'; level: 'info'; step: 5 }
  /** Word exposure is not written anywhere yet — not live (plan 73 §3.9). */
  | { code: 'INF_EXPOSURE_LATER'; level: 'info'; step: 5 };

export type IssueCode = Issue['code'];

/** A pass mark above this, and one mis-heard digit fails the exercise. */
const PASS_HIGH = 90;
/** More cells than this on one playback is a memory test. */
const ONE_PLAY_CROWDED = 3;
/** More cells than this without timecodes, and fragments would help. */
const SEGMENTS_HELP = 5;
/** A `word` answer longer than this is a short_answer question. */
const SENTENCE_WORDS = 4;

/** Everything wrong with the document, in the prototype's order. */
export function issues(ex: InformationTransferContent): Issue[] {
  const out: Issue[] = [];
  const pack = packOf(ex);
  const src = sourceText(ex);
  const ready = readyFields(ex).length;

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.sourceKind === 'text' && ex.passage.trim() === '') {
    out.push({ code: 'INF_NO_PASSAGE', level: 'blocker', step: 1 });
  }
  if (ex.sourceKind === 'audio' && ex.audio.transcript.trim() === '') {
    out.push({ code: 'INF_NO_TRANSCRIPT', level: 'blocker', step: 1 });
  }
  if (ex.title.trim() === '') out.push({ code: 'INF_NO_TITLE', level: 'warning', step: 1 });
  if (ex.instruction.trim() === '') out.push({ code: 'INF_NO_INSTRUCTION', level: 'warning', step: 1 });
  if (!pack) out.push({ code: 'INF_NO_PACK', level: 'warning', step: 1, language: ex.language });

  // ── Steps 2 and 3, field by field ─────────────────────────────────────────
  if (ex.fields.length === 0) out.push({ code: 'INF_NO_FIELDS', level: 'blocker', step: 2 });
  const labels = new Set<string>();
  ex.fields.forEach((f, i) => {
    const n = i + 1;
    const label = f.label.trim();
    const exp = expectedOf(f);
    const format = isFormatType(f.type);

    if (label === '') {
      out.push({ code: 'INF_FIELD_NO_LABEL', level: 'blocker', step: 2, fieldId: f.id, n });
    } else {
      const key = normText(label);
      if (labels.has(key)) {
        out.push({ code: 'INF_DUPLICATE_LABEL', level: 'warning', step: 2, fieldId: f.id, n, label });
      }
      labels.add(key);
    }
    if (exp.length === 0) {
      out.push({ code: 'INF_FIELD_NO_KEY', level: 'blocker', step: 2, fieldId: f.id, n, label });
    }
    if (f.why.trim() === '' && label !== '') {
      out.push({ code: 'INF_FIELD_NO_WHY', level: 'blocker', step: 2, fieldId: f.id, n, label });
    }
    for (const value of exp) {
      if (format && canon(f.type, value, pack, ex.grading).length === 0) {
        out.push({
          code: 'INF_KEY_UNREADABLE',
          level: 'blocker',
          step: 3,
          fieldId: f.id,
          n,
          label,
          value,
          type: f.type,
        });
      }
    }
    if (src.trim() !== '' && exp.length > 0 && !format && !exp.some((e) => inSource(ex, e))) {
      out.push({
        code: 'INF_KEY_NOT_IN_SOURCE',
        level: 'warning',
        step: 2,
        fieldId: f.id,
        n,
        label,
        value: exp[0] ?? '',
      });
    }
    if (
      f.type === 'word' &&
      exp.length === 1 &&
      normText(exp[0] ?? '').split(' ').length > SENTENCE_WORDS
    ) {
      out.push({ code: 'INF_SENTENCE_ANSWER', level: 'warning', step: 2, fieldId: f.id, n, label });
    }
    if (f.type === 'time' && exp.length > 0) {
      const readings = timeCandidates(exp[0] ?? '', pack);
      if (readings.length > 1) {
        out.push({
          code: 'INF_TIME_AMBIGUOUS',
          level: 'info',
          step: 3,
          fieldId: f.id,
          n,
          label,
          value: exp[0] ?? '',
          suggestion: readings[readings.length - 1] ?? '',
        });
      }
    }
  });

  if (ready > 0 && ready < MIN_FIELDS) {
    out.push({ code: 'INF_FEW_FIELDS', level: 'warning', step: 2, count: ready, min: MIN_FIELDS });
  }
  if (ready > MAX_FIELDS) {
    out.push({ code: 'INF_MANY_FIELDS', level: 'warning', step: 2, count: ready, max: MAX_FIELDS });
  }
  if (ready > 0 && ex.fields.every((f) => isLexicalType(f.type))) {
    out.push({ code: 'INF_ALL_FREE_TEXT', level: 'info', step: 2 });
  }
  if (ready > 0 && !keyPasses(ex)) {
    out.push({ code: 'INF_KEY_FAILS_GRADER', level: 'blocker', step: 3 });
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  if (ex.sourceKind === 'audio' && ex.audio.settings.plays === 1 && ready > ONE_PLAY_CROWDED) {
    out.push({ code: 'INF_ONE_PLAY_MANY', level: 'warning', step: 4, count: ready });
  }
  if (ex.sourceKind === 'audio' && !ex.audio.useSegments && ready > SEGMENTS_HELP) {
    out.push({ code: 'INF_NO_SEGMENTS', level: 'info', step: 4, count: ready });
  }
  if (ex.sourceKind === 'text' && ex.answering.showSource === 'afterAnswer') {
    out.push({ code: 'INF_SOURCE_HIDDEN', level: 'blocker', step: 4 });
  }

  // ── Step 3 settings (the prototype lists them after delivery) ─────────────
  if (ex.grading.typos) out.push({ code: 'INF_TYPOS_ON', level: 'info', step: 3 });
  if (!ex.grading.spelledNumbers) out.push({ code: 'INF_SPELLED_OFF', level: 'info', step: 3 });
  if (ex.grading.strictCase) out.push({ code: 'INF_CASE_SENSITIVE', level: 'warning', step: 3 });

  // ── Step 5 ────────────────────────────────────────────────────────────────
  if (ex.scoring.passPct > PASS_HIGH && ready > 0) {
    out.push({ code: 'INF_PASS_TOO_HIGH', level: 'warning', step: 5, pct: ex.scoring.passPct, count: ready });
  }
  if (ex.grading.requiredAll) out.push({ code: 'INF_REQUIRED_ALL', level: 'info', step: 5 });
  if (ex.scoring.memory === 'none') out.push({ code: 'INF_NO_MEMORY', level: 'info', step: 5 });
  if (ex.scoring.memory !== 'none') out.push({ code: 'INF_SKILL_CARD_LATER', level: 'info', step: 5 });
  if (ex.scoring.logWordExposure) out.push({ code: 'INF_EXPOSURE_LATER', level: 'info', step: 5 });

  return out;
}

/** Which of this builder's steps owns each part of the audio layer (the prototype's map). */
export const AUDIO_STEPS: AudioStepMap = { source: 1, rules: 4, transcript: 1, segments: 2 };

/** The audio layer's findings for a recording, or none for a text source. */
export function audioIssuesOf(ex: InformationTransferContent): AudioIssue[] {
  if (ex.sourceKind !== 'audio') return [];
  return audioIssues(
    { audio: { ...ex.audio, enabled: true } },
    ex.fields.map((f) => (f.audio === null ? { id: f.id } : { id: f.id, audio: f.audio })),
  );
}

/** The same, placed on this builder's steps — for the rail, the cards and the gate. */
export function placedAudioIssues(ex: InformationTransferContent): PlacedAudioIssue[] {
  return placeAudioIssues(audioIssuesOf(ex), AUDIO_STEPS);
}

export function blockers(ex: InformationTransferContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

/** Whether the exercise may be published — the type's blockers and the layer's. */
export function isReady(ex: InformationTransferContent): boolean {
  return blockers(ex).length === 0 && !audioIssuesOf(ex).some((i) => i.level === 'blocker');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step, from the type's own issues (`infStepState`) — the builder folds the
 * audio layer's in on top (`foldAudioIntoStep`). An `info` does not colour the dot. Step 1 is
 * `empty` without a source, step 2 without a ready field.
 */
export function stepState(ex: InformationTransferContent, step: IssueStep): StepState {
  const own = issues(ex).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.some((i) => i.level === 'warning')) return { s: 'warn', errs: 0 };
  const empty =
    (step === 1 && sourceText(ex).trim() === '') || (step === 2 && readyFields(ex).length === 0);
  return { s: empty ? 'empty' : 'ok', errs: 0 };
}
