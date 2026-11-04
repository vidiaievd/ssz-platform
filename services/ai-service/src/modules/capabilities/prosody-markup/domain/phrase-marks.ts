import type { Span } from '../../../pronunciation/application/text-word-stresses.js';

/**
 * Phrase marks of a text (plan 86, §4a, decision 4): where its intonation groups end, with
 * what pitch and pause, which word of a group carries the phrase accent, and which words run
 * into the next. Word stresses are the lexicon's and are not asked for. Words are the caller's,
 * as spans — the anchors stay content-service's, as for the lexicon's stresses (step 5b).
 */
export interface PhraseMarksInput {
  /** The language of the text, spelled out (`Norwegian Bokmål`). */
  targetLanguage: string;
  text: string;
  /** The caller's words as `[start, end)` offsets in `text`, in order. */
  spans: readonly Span[];
}

export type GroupPitch = 'rise' | 'fall' | 'level';
export type GroupPause = 'short' | 'long';

/** The end of an intonation group, after word `index`. */
export interface SuggestedBoundary {
  index: number;
  pitch: GroupPitch;
  /** Null — the next group follows without a pause. */
  pause: GroupPause | null;
}

/** What the agent suggests, by the indices of the request's spans, each list in word order. */
export interface PhraseMarks {
  accents: number[];
  boundaries: SuggestedBoundary[];
  /** Word `index` runs into word `index + 1`. */
  links: number[];
}

interface RawGroup {
  end: number;
  accent: number | null;
  pitch: GroupPitch;
  pause: GroupPause | 'none';
}

interface RawMarks {
  groups: RawGroup[];
  links: number[];
}

/**
 * The text as the model reads it: every word followed by its index, `Jeg⟨0⟩ heter⟨1⟩ Anna⟨2⟩.`,
 * everything between the words — punctuation, line breaks, markdown — kept as it is.
 */
export function numberedText(input: Pick<PhraseMarksInput, 'text' | 'spans'>): string {
  let out = '';
  let at = 0;
  input.spans.forEach(([, e], index) => {
    out += `${input.text.slice(at, e)}⟨${index}⟩`;
    at = e;
  });
  return out + input.text.slice(at);
}

/** Groups by their last word, each with its accent, and the links. Built per call: the index range. */
export function phraseMarksSchema(count: number): Record<string, unknown> {
  const index = (description: string) => ({ type: 'integer', minimum: 0, maximum: count - 1, description });
  return {
    type: 'object',
    additionalProperties: false,
    required: ['groups', 'links'],
    properties: {
      groups: {
        type: 'array',
        description: 'Every intonation group of the text, in order',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['end', 'accent', 'pitch', 'pause'],
          properties: {
            end: index('Index of the last word of the group'),
            accent: {
              ...index('Index of the word carrying the phrase accent, inside the group'),
              type: ['integer', 'null'],
            },
            pitch: {
              type: 'string',
              enum: ['rise', 'fall', 'level'],
              description: 'The melody at the end of the group',
            },
            pause: { type: 'string', enum: ['none', 'short', 'long'], description: 'The pause after the group' },
          },
        },
      },
      links: {
        type: 'array',
        description: 'Indices of words that run into the next word without a break',
        items: index('A word linked to the next one'),
      },
    },
  };
}

/**
 * Groups in order, each accent inside its group, links never at a group's end or past the last
 * word. What the schema cannot say; a broken answer goes to the fallback model.
 */
export function verifyPhraseMarks(count: number): (data: unknown) => string | null {
  return (data) => {
    const answer = data as RawMarks;
    let start = 0;
    const ends = new Set<number>();
    for (const [n, group] of answer.groups.entries()) {
      if (group.end < start) return `group ${n} ends at ${group.end}, before its start ${start}`;
      if (group.accent !== null && (group.accent < start || group.accent > group.end)) {
        return `group ${n} has its accent ${group.accent} outside ${start}–${group.end}`;
      }
      ends.add(group.end);
      start = group.end + 1;
    }
    const linked = new Set<number>();
    for (const link of answer.links) {
      if (link >= count - 1) return `link ${link} has no next word`;
      if (ends.has(link)) return `link ${link} crosses a group end`;
      if (linked.has(link)) return `link ${link} given twice`;
      linked.add(link);
    }
    return null;
  };
}

/**
 * The verified answer as marks. A link across anything but spaces — a comma, a line break —
 * is dropped rather than refused: the model's habit, and the reader would draw it across.
 */
export function readPhraseMarks(data: unknown, input: Pick<PhraseMarksInput, 'text' | 'spans'>): PhraseMarks {
  const answer = data as RawMarks;
  const accents: number[] = [];
  const boundaries: SuggestedBoundary[] = [];
  for (const group of answer.groups) {
    if (group.accent !== null) accents.push(group.accent);
    boundaries.push({ index: group.end, pitch: group.pitch, pause: group.pause === 'none' ? null : group.pause });
  }
  const links = answer.links
    .filter((i) => /^[ \t]+$/.test(input.text.slice(input.spans[i]![1], input.spans[i + 1]![0])))
    .sort((a, b) => a - b);
  return { accents, boundaries, links };
}
