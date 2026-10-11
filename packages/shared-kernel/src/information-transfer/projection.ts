// What a student is allowed to see before answering (plan 73 §3.2).
//
// The source (the text, or nothing — the recording rides on the audio block), the blank and the
// delivery settings the runner draws by. No expected value, no explanation, no pass mark, no
// grading or memory setting — ever. Three responsibilities beyond omission:
//
//   1. **Only ready cells reach the student** (`readyFields`): a cell without a label, an answer
//      or a reason cannot be graded, and preflight would not have let it out anyway.
//   2. **The empty cell's placeholder comes from the pack**, resolved here: VoxOrd carries no
//      kernel, and «kl.» or «dag og måned» are words of the course language.
//   3. **A hint is here only when it is printed from the start** (`hintsAfter: 0`). Under
//      «after one attempt» it arrives with the first verdict (grading.ts), so the first go stays
//      clean whatever the client does.
//
// The audio block is not added here: content-service and the engine put it on with the layer's
// `withStudentAudio`, which also gathers the cells' timecodes onto `audio.segments`.

import { packOf, readyFields } from './derive.js';
import type { Answering, FieldType, Layout, SourceKind } from './model.js';
import { isFormatType } from './model.js';
import { fromPersisted } from './persistence.js';

export interface ProjectedField {
  id: string;
  label: string;
  type: FieldType;
  unit: string;
  /** What the empty cell shows: «kl.». Empty when the pack has none. */
  placeholder: string;
  /** A digit keyboard on a phone — the format types but the date (`INFCell`). */
  numeric: boolean;
  /** Only under `hintsAfter: 0`. */
  hint?: string;
}

export interface StudentProjection {
  title: string;
  instruction: string;
  sourceKind: SourceKind;
  /** The course language, so the runner can mark the reading font's language. */
  language: string;
  /** A text source only. */
  passageTitle?: string;
  passage?: string;
  form: { formTitle: string; layout: Layout };
  fields: ProjectedField[];
  answering: Answering;
}

export function toStudentProjection(content: unknown, expectedAnswers: unknown): StudentProjection {
  const ex = fromPersisted(content, expectedAnswers);
  const pack = packOf(ex);
  const hintsNow = ex.answering.hintsAfter === 0;

  const fields = readyFields(ex).map((f): ProjectedField => {
    const hint = f.hint.trim();
    return {
      id: f.id,
      label: f.label.trim(),
      type: f.type,
      unit: f.unit.trim(),
      placeholder: pack?.cellPlaceholders[f.type] ?? '',
      numeric: isFormatType(f.type) && f.type !== 'date',
      ...(hintsNow && hint !== '' ? { hint } : {}),
    };
  });

  return {
    title: ex.title,
    instruction: ex.instruction,
    sourceKind: ex.sourceKind,
    language: ex.language,
    ...(ex.sourceKind === 'text' ? { passageTitle: ex.passageTitle, passage: ex.passage } : {}),
    form: { formTitle: ex.form.formTitle, layout: ex.form.layout },
    fields,
    answering: { ...ex.answering },
  };
}

/**
 * The projection for a graded delivery (Q8-A of plan 67): one check, no key. The hints printed
 * on the form stay — they are the form, not help after a miss; «after one attempt» never comes.
 * The grader enforces the same through `check({ graded })`; this keeps the screen from offering
 * what the server will refuse.
 */
export function withGradedSettings(projection: unknown): unknown {
  if (typeof projection !== 'object' || projection === null || Array.isArray(projection)) {
    return projection;
  }
  const record = projection as Record<string, unknown>;
  const answering = (
    typeof record['answering'] === 'object' && record['answering'] !== null
      ? record['answering']
      : {}
  ) as Record<string, unknown>;
  return {
    ...record,
    answering: {
      ...answering,
      attempts: 1,
      revealKey: 'never',
      hintsAfter: answering['hintsAfter'] === 0 ? 0 : 9,
    },
  };
}
