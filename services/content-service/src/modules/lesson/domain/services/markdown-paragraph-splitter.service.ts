/**
 * Pure domain service — no @Injectable, no external dependencies.
 * Splits lesson body markdown into paragraphs for Bilingual/Focus reading modes.
 *
 * Paragraphs are blank-line delimited (one or more consecutive blank lines).
 * Leading/trailing whitespace per paragraph is trimmed; empty paragraphs are
 * dropped. Index in the returned array is the paragraphIndex used to key
 * LessonParagraphTranslation rows — it must stay stable across re-splits of
 * the same markdown, which this delimiter choice guarantees as long as the
 * markdown's blank-line structure is unchanged.
 */
export class MarkdownParagraphSplitterService {
  static split(bodyMarkdown: string): string[] {
    if (!bodyMarkdown?.trim()) {
      return [];
    }

    return bodyMarkdown
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
}
