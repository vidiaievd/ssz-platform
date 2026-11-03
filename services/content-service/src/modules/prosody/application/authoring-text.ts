import type { ProsodyIssue, ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { prosodyIssues, toProsodyNotation } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../shared/kernel/result.js';
import type { ProsodyError } from '../domain/prosody-error.js';
import type { ProsodyOwner } from '../domain/prosody-owner.js';
import type { IProsodyTextReader } from '../domain/repositories/prosody-text.reader.interface.js';

/**
 * The text an author marks: the body of a lesson variant (not versioned), or the passage of
 * one read_aloud prompt in the document the builder edits — the draft when there is one.
 */
export async function authoringText(
  reader: IProsodyTextReader,
  owner: ProsodyOwner,
): Promise<Result<string, ProsodyError>> {
  if (owner.kind === 'lesson') return reader.lessonBody(owner.lessonId, owner.variantId);

  const passages = await reader.readAloudPassages(owner.exerciseId, 'draft');
  if (passages.isFail) return Result.fail(passages.error);
  const prompt = passages.value.prompts.find((p) => p.id === owner.promptId);
  if (!prompt) return Result.fail({ code: 'PROMPT_NOT_FOUND' });
  if (prompt.text.trim() === '') return Result.fail({ code: 'PROMPT_HAS_NO_TEXT' });
  return Result.ok(prompt.text);
}

/** What the editor gets back, on read and after a save. */
export interface ProsodyAuthoringView {
  text: string;
  /** The layer written out (`'2snakker \ |`); orphans and vowel length are not in it. */
  notation: string;
  /** Marks the notation could not place (`toProsodyNotation`). */
  dropped: number;
  /** The stored layer anchored to `text`, orphans included. */
  layer: ProsodyLayer;
  issues: ProsodyIssue[];
  /** When the author last saved; null when nothing is stored. */
  updatedAt: Date | null;
}

export function authoringView(
  text: string,
  layer: ProsodyLayer,
  updatedAt: Date | null,
): ProsodyAuthoringView {
  const { notation, dropped } = toProsodyNotation(text, layer);
  return { text, notation, dropped, layer, issues: prosodyIssues(text, layer), updatedAt };
}
