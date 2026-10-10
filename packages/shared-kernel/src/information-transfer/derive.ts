// What follows from the document without being stored (plan 73 §3.1).

import { normText } from './formats.js';
import type { Field, InformationTransferContent } from './model.js';
import { isFormatType } from './model.js';
import type { FormatPack } from './packs/index.js';
import { packFor } from './packs/index.js';

/** The expected wordings, trimmed, empties dropped (`infExpected`). */
export function expectedOf(field: Pick<Field, 'expected'>): string[] {
  return field.expected.map((x) => String(x ?? '').trim()).filter((x) => x !== '');
}

/**
 * A cell the student can be given: a label, an answer and the reason for it (`infReadyFields`).
 * The single filter of what reaches the student, the score and the event.
 */
export function readyFields(ex: Pick<InformationTransferContent, 'fields'>): Field[] {
  return ex.fields.filter(
    (f) => f.label.trim() !== '' && expectedOf(f).length > 0 && f.why.trim() !== '',
  );
}

/** What the facts are checked against: the text, or the transcript of the recording. */
export function sourceText(
  ex: Pick<InformationTransferContent, 'sourceKind' | 'passage' | 'audio'>,
): string {
  return ex.sourceKind === 'audio' ? ex.audio.transcript : ex.passage;
}

/** Does this wording appear in the source? Normalised on both sides (`infInSource`). */
export function inSource(
  ex: Pick<InformationTransferContent, 'sourceKind' | 'passage' | 'audio'>,
  value: string,
): boolean {
  return normText(sourceText(ex)).includes(normText(value));
}

/** The pack of the course language, or `undefined` — never another language's (Q2-A). */
export function packOf(ex: Pick<InformationTransferContent, 'language'>): FormatPack | undefined {
  return packFor(ex.language);
}

/** Cells whose normaliser reads the fact — the gate's «formats normalised for N cells». */
export function formatFields(ex: Pick<InformationTransferContent, 'fields'>): Field[] {
  return readyFields(ex).filter((f) => isFormatType(f.type));
}

/** Words in the passage — the counter in the text card's head. */
export function wordsIn(text: string): number {
  const t = text.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
}

/** The skill the form rates, by its source (DECISIONS §4). */
export function skillOf(ex: Pick<InformationTransferContent, 'sourceKind'>): string {
  return ex.sourceKind === 'audio' ? 'selective_listening' : 'selective_reading';
}
