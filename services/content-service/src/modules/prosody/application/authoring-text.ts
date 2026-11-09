import type { ProsodyIssue, ProsodyLayer } from '@ssz/shared-kernel/prosody';
import type { LexiconWords } from './ports/lexicon-stress.source.js';
import { prosodyIssues, toProsodyNotation } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../shared/kernel/result.js';
import type { ProsodyError } from '../domain/prosody-error.js';
import type { ProsodyOwner } from '../domain/prosody-owner.js';
import type { IProsodyTextReader } from '../domain/repositories/prosody-text.reader.interface.js';

/** The text an author marks, with what a suggestion for it is asked by. */
export interface AuthoringSubject {
  text: string;
  /** The material's `target_language`. */
  language: string;
  /** The material's owner school — the payer of a suggestion; null — the author pays. */
  ownerSchoolId: string | null;
}

/**
 * The text an author marks: the body of a lesson variant (not versioned), or the passage of
 * one read_aloud prompt in the document the builder edits — the draft when there is one.
 */
export async function authoringSubject(
  reader: IProsodyTextReader,
  owner: ProsodyOwner,
): Promise<Result<AuthoringSubject, ProsodyError>> {
  if (owner.kind === 'lesson') {
    const body = await reader.lessonBody(owner.lessonId, owner.variantId);
    return body.isFail ? Result.fail(body.error) : Result.ok(body.value);
  }

  const passages = await reader.readAloudPassages(owner.exerciseId, 'draft');
  if (passages.isFail) return Result.fail(passages.error);
  const prompt = passages.value.prompts.find((p) => p.id === owner.promptId);
  if (!prompt) return Result.fail({ code: 'PROMPT_NOT_FOUND' });
  if (prompt.text.trim() === '') return Result.fail({ code: 'PROMPT_HAS_NO_TEXT' });
  const { language, ownerSchoolId } = passages.value;
  return Result.ok({ text: prompt.text, language, ownerSchoolId });
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
  /**
   * Step 6h.2: what the lexicon says under `text` — the stresses the student sees unless the
   * author overrides them, the sounds, and the words the author must settle when the
   * pronunciation guide is on. Empty when ai-service does not answer.
   */
  lexicon: LexiconWords;
}

export function authoringView(
  text: string,
  layer: ProsodyLayer,
  updatedAt: Date | null,
  lexicon: LexiconWords,
): ProsodyAuthoringView {
  const { notation, dropped } = toProsodyNotation(text, layer);
  return { text, notation, dropped, layer, issues: prosodyIssues(text, layer), updatedAt, lexicon };
}
