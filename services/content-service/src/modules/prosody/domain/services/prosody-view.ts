// Pure functions behind the prosody routes (plan 86, step 5): follow a stored layer to the
// text as it is now, cut a whole-body layer into the reader's paragraphs, and hand the
// student only marks that land on a word.

import { tokenize } from '@ssz/shared-kernel/text';
import type { ProsodyElement, ProsodyLayer, WordSounds, WordStress } from '@ssz/shared-kernel/prosody';
import {
  anchorLength,
  elementsOf,
  emptyProsodyLayer,
  layerOf,
  mergeProsody,
  prosodyIssues,
  reanchorProsody,
} from '@ssz/shared-kernel/prosody';

/**
 * The authored layer anchored to `text`. A text edited since the layer was saved is
 * followed here, on read, from the snapshot the author saved against — see the comment on
 * `LessonProsodyLayer` in the schema.
 */
export function layerForText(
  stored: { sourceText: string; layer: ProsodyLayer } | null,
  text: string,
): ProsodyLayer {
  if (!stored) return emptyProsodyLayer();
  if (stored.sourceText === text) return stored.layer;
  return reanchorProsody(stored.sourceText, text, stored.layer);
}

/**
 * What a student is drawn: the lexicon words with the authored layer over them, orphans
 * and any mark that does not fit the text left out. The lexicon words (step 5b) come from
 * ai-service; without them the authored layer is all there is.
 */
export function studentLayer(
  text: string,
  authored: ProsodyLayer,
  lexicon: readonly WordStress[] = [],
): ProsodyLayer {
  return withoutBroken(text, mergeProsody(lexicon, authored));
}

/**
 * The authored layer with its phrase marks replaced by a suggestion (plan 86, step 5c.2): the
 * teacher's word stresses stay, orphaned ones too; accents, group ends and linkings — placed
 * or orphaned — are the suggestion's. The agent never sets word stress, so nothing of the
 * teacher's is overwritten by it.
 */
export function withSuggestedPhrases(
  authored: ProsodyLayer,
  suggested: Pick<ProsodyLayer, 'accents' | 'boundaries' | 'links'>,
): ProsodyLayer {
  return layerOf(
    [
      ...authored.stresses.map((mark) => ({ kind: 'stress' as const, mark })),
      ...elementsOf({ ...emptyProsodyLayer(), ...suggested }),
    ],
    authored.orphans.filter((orphan) => orphan.kind === 'stress'),
  );
}

export function isEmptyLayer(layer: ProsodyLayer): boolean {
  return elementsOf(layer).length === 0 && layer.orphans.length === 0;
}

/**
 * A layer over `text` cut into the layers of its parts, each anchored to its own part.
 * `parts` are consecutive pieces of `text` that only drop whitespace between them — the
 * paragraphs of `MarkdownParagraphSplitterService` — so the tokens of the parts are the
 * tokens of the text, in order. A linking that would join two parts is dropped.
 */
export function splitLayer(
  text: string,
  layer: ProsodyLayer,
  parts: readonly string[],
): ProsodyLayer[] {
  const elements = elementsOf(layer);
  return partRanges(text, parts).map(({ from, count }) => {
    const own = elements
      .filter((el) => el.mark.i >= from && el.mark.i + anchorLength(el.kind) <= from + count)
      .map((el) => ({ ...el, mark: { ...el.mark, i: el.mark.i - from } }) as ProsodyElement);
    return layerOf(own);
  });
}

/** The sounds of the words of `text` cut into its parts the way `splitLayer` cuts the layer. */
export function splitSounds(
  text: string,
  sounds: readonly WordSounds[],
  parts: readonly string[],
): WordSounds[][] {
  return partRanges(text, parts).map(({ from, count }) =>
    sounds.filter((x) => x.i >= from && x.i < from + count).map((x) => ({ ...x, i: x.i - from })),
  );
}

/** Where each part's tokens begin and how many there are, counted over the tokens of the whole text. */
function partRanges(text: string, parts: readonly string[]): { from: number; count: number }[] {
  const tokens = tokenize(text);
  let cursor = 0;
  let first = 0;
  return parts.map((part) => {
    const start = text.indexOf(part, cursor);
    const end = start < 0 ? cursor : start + part.length;
    cursor = end;
    let count = 0;
    while (first + count < tokens.length && (tokens[first + count]?.e ?? Infinity) <= end) count++;
    const from = first;
    first += count;
    return { from, count };
  });
}

/** The layer without orphans and without any element `prosodyIssues` finds a blocker on. */
function withoutBroken(text: string, layer: ProsodyLayer): ProsodyLayer {
  const issues = prosodyIssues(text, layer);
  if (issues.some((x) => x.code === 'PR_TOKENIZER')) return emptyProsodyLayer();

  const broken = new Set<string>();
  for (const x of issues) {
    if (x.code === 'PR_ANCHOR_MISSING' || x.code === 'PR_ANCHOR_STALE' || x.code === 'PR_DUPLICATE')
      broken.add(`${x.kind}:${x.i}`);
    else if (x.code === 'PR_VOWEL_OUTSIDE_WORD') broken.add(`stress:${x.i}`);
    else if (x.code === 'PR_BOUNDARY_EMPTY') broken.add(`boundary:${x.i}`);
  }
  return layerOf(elementsOf(layer).filter((el) => !broken.has(`${el.kind}:${el.mark.i}`)));
}
