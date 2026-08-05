export interface SpanAnchorCandidate {
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
}

/** More than a handful of candidates is not a repair suggestion, it's a search result. */
const MAX_CANDIDATES = 5;

/**
 * Pure domain service — no @Injectable, no dependencies.
 *
 * Finds where a broken span's snapshot text now lives in the body, so the
 * authoring UI can offer a one-click re-anchor. Deliberately dumb: exact
 * substring search, no fuzzy matching. A snapshot that no longer appears
 * verbatim was edited, and guessing at the author's new wording is exactly the
 * kind of silent rebinding spans exist to prevent.
 *
 * Nothing here re-anchors anything. Candidates are a suggestion the author
 * accepts explicitly, and the UI only offers the click when there is exactly
 * one — two occurrences in a paragraph is precisely the case where an automatic
 * choice would bind to the wrong one.
 */
export class TextSpanAnchorService {
  static findCandidates(paragraphs: string[], snapshot: string): SpanAnchorCandidate[] {
    if (!snapshot) return [];

    const candidates: SpanAnchorCandidate[] = [];
    for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
      const paragraph = paragraphs[paragraphIndex];
      let from = 0;
      for (;;) {
        const at = paragraph.indexOf(snapshot, from);
        if (at === -1) break;
        candidates.push({
          paragraphIndex,
          charStart: at,
          charEnd: at + snapshot.length,
        });
        if (candidates.length >= MAX_CANDIDATES) return candidates;
        from = at + 1;
      }
    }
    return candidates;
  }
}
