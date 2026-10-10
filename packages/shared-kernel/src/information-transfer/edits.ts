// The builder's edits, as pure functions over the document (the mutations of `inf/steps.jsx`).
//
// Each takes the document and returns a new one; nothing here touches the network or the clock.
// The builder wires them to its controls, the tests call them directly.

import type { ExerciseAudio, ItemAudio } from '../audio/model.js';
import type {
  Answering,
  Field,
  FieldType,
  Form,
  Grading,
  InfFocus,
  InformationTransferContent,
  Scoring,
  SourceKind,
} from './model.js';
import { newField } from './model.js';

type Doc = InformationTransferContent;

export function setTitle(ex: Doc, title: string): Doc {
  return { ...ex, title };
}

export function setInstruction(ex: Doc, instruction: string): Doc {
  return { ...ex, instruction };
}

/** The one switch. Choosing the recording switches the audio block on, as the prototype does. */
export function setSourceKind(ex: Doc, sourceKind: SourceKind): Doc {
  return {
    ...ex,
    sourceKind,
    audio: sourceKind === 'audio' ? { ...ex.audio, enabled: true } : ex.audio,
  };
}

export function setFocus(ex: Doc, focus: InfFocus): Doc {
  return { ...ex, focus };
}

export function setLanguage(ex: Doc, language: string): Doc {
  return { ...ex, language };
}

export function setPassageTitle(ex: Doc, passageTitle: string): Doc {
  return { ...ex, passageTitle };
}

export function setPassage(ex: Doc, passage: string): Doc {
  return { ...ex, passage };
}

export function setAudio(ex: Doc, patch: Partial<ExerciseAudio>): Doc {
  return { ...ex, audio: { ...ex.audio, ...patch } };
}

export function setForm(ex: Doc, patch: Partial<Form>): Doc {
  return { ...ex, form: { ...ex.form, ...patch } };
}

/** A new field at the end — empty, or from «Lift from the source» with its type and value. */
export function addField(ex: Doc, type: FieldType = 'word', value = '', label = ''): Doc {
  const field = newField(label, type);
  if (value !== '') field.expected = [value];
  return { ...ex, fields: [...ex.fields, field] };
}

/** The last field cannot go: the delete button is disabled under two. */
export function removeField(ex: Doc, fieldId: string): Doc {
  if (ex.fields.length < 2) return ex;
  return { ...ex, fields: ex.fields.filter((f) => f.id !== fieldId) };
}

/** Swap with the neighbour above (`-1`) or below (`1`); a no-op at either end. */
export function moveField(ex: Doc, index: number, by: -1 | 1): Doc {
  const to = index + by;
  if (index < 0 || index >= ex.fields.length || to < 0 || to >= ex.fields.length) return ex;
  const fields = [...ex.fields];
  [fields[index], fields[to]] = [fields[to] as Field, fields[index] as Field];
  return { ...ex, fields };
}

export function setField(ex: Doc, fieldId: string, patch: Partial<Omit<Field, 'id'>>): Doc {
  return { ...ex, fields: ex.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) };
}

/**
 * Write wording `k`. The builder always renders one empty row after the last wording; typing into
 * it appends. A wording emptied anywhere but at the end stays as an empty slot, and the empty
 * trailing one is dropped — the prototype's `filter((x, ix) => x || ix < a.length - 1)`.
 */
export function setExpected(ex: Doc, fieldId: string, k: number, value: string): Doc {
  return {
    ...ex,
    fields: ex.fields.map((f) => {
      if (f.id !== fieldId) return f;
      const expected = [...f.expected];
      while (expected.length <= k) expected.push('');
      expected[k] = value;
      return {
        ...f,
        expected: expected.filter((x, ix) => x !== '' || ix < expected.length - 1),
      };
    }),
  };
}

/** The trash button beside an extra wording. */
export function removeExpected(ex: Doc, fieldId: string, k: number): Doc {
  return {
    ...ex,
    fields: ex.fields.map((f) =>
      f.id === fieldId ? { ...f, expected: f.expected.filter((_, ix) => ix !== k) } : f,
    ),
  };
}

export function setFieldAudio(ex: Doc, fieldId: string, audio: ItemAudio | null): Doc {
  return setField(ex, fieldId, { audio });
}

export function setGrading(ex: Doc, patch: Partial<Grading>): Doc {
  return { ...ex, grading: { ...ex.grading, ...patch } };
}

export function setAnswering(ex: Doc, patch: Partial<Answering>): Doc {
  return { ...ex, answering: { ...ex.answering, ...patch } };
}

/** The pass mark is clamped to 0–100, as the number input of step 5 does. */
export function setScoring(ex: Doc, patch: Partial<Scoring>): Doc {
  const next = { ...ex.scoring, ...patch };
  const pct = Number.isFinite(next.passPct) ? Math.round(next.passPct) : ex.scoring.passPct;
  return { ...ex, scoring: { ...next, passPct: Math.max(0, Math.min(100, pct)) } };
}
