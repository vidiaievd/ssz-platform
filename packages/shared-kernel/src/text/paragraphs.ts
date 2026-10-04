// Blank-line paragraph split — the one the whole platform reads a body with.
//
// Moved here from ssz-platform-web `features/content-authoring/lib/split-paragraphs.ts`
// (plan 67, decision Q2-A) so the server and the client split a text with the same build:
// `highlight_in_text` sends paragraph ranges to the student and grades marks that must not
// cross them, and a split that differed by one blank line between the two sides would read
// as a content error. The web file is now a re-export of this one.
//
// It mirrors content-service's `MarkdownParagraphSplitterService` exactly, so paragraph
// indices stay aligned with `LessonParagraphTranslation.paragraphIndex` and
// `LessonTextSpan.paragraphIndex` (spec 16): one or more blank lines, each paragraph
// trimmed, empty chunks dropped before numbering.

/** A paragraph together with where it sits in the body it came from. */
export interface ParagraphWithOffsets {
  /**
   * Index in the split — the value that keys `LessonParagraphTranslation` and anchors a
   * `LessonTextSpan`. Empty chunks are dropped before numbering, so this is not the index of
   * the raw chunk.
   */
  index: number;
  /** The trimmed paragraph text, byte-identical to what the service stores. */
  text: string;
  /** Offset of `text[0]` in the body. */
  bodyStart: number;
  /** Offset one past `text`'s last character in the body. */
  bodyEnd: number;
}

/** Same delimiter as content-service: one or more blank lines. */
const PARAGRAPH_SEPARATOR = /\n\s*\n+/g;

/**
 * Blank-line paragraph split that also reports where each paragraph came from.
 *
 * The offsets exist because a span's offsets may be relative to the *trimmed* paragraph
 * while a selection is relative to the whole body. Two things shift between those
 * coordinate spaces and both are silent when wrong: the per-paragraph `trim()` moves
 * offsets, and dropping empty chunks renumbers every paragraph after them.
 *
 * Trimming goes through the real `trim()`/`trimStart()` rather than a hand-written
 * whitespace class, so this cannot disagree with the service about what counts as
 * whitespace (`trim()` also strips NBSP and BOM).
 */
export function splitParagraphsWithOffsets(bodyMarkdown: string): ParagraphWithOffsets[] {
  if (!bodyMarkdown?.trim()) return [];

  const out: ParagraphWithOffsets[] = [];
  let chunkStart = 0;

  const pushChunk = (chunk: string, start: number) => {
    const text = chunk.trim();
    if (text.length === 0) return;
    const leading = chunk.length - chunk.trimStart().length;
    const bodyStart = start + leading;
    out.push({ index: out.length, text, bodyStart, bodyEnd: bodyStart + text.length });
  };

  // Walking the separators reproduces `String.split` on the same regex — same engine, same
  // match order — while keeping the offsets `split` throws away.
  PARAGRAPH_SEPARATOR.lastIndex = 0;
  for (const match of bodyMarkdown.matchAll(PARAGRAPH_SEPARATOR)) {
    pushChunk(bodyMarkdown.slice(chunkStart, match.index), chunkStart);
    chunkStart = match.index + match[0].length;
  }
  pushChunk(bodyMarkdown.slice(chunkStart), chunkStart);

  return out;
}

/**
 * Blank-line paragraph split, mirroring content-service's `MarkdownParagraphSplitterService`.
 *
 * Derived from `splitParagraphsWithOffsets` so the two cannot drift apart.
 */
export function splitParagraphs(bodyMarkdown: string): string[] {
  return splitParagraphsWithOffsets(bodyMarkdown).map((p) => p.text);
}
