import type { SoundFamily } from '../../../pronunciation/domain/sound-inventory.js';

/** One sound remark to explain: a word and the family of its weak sound (plan 88, step 5b). */
export interface SoundToExplain {
  /** The word as the passage writes it. */
  word: string;
  /** The word's sounds in IPA, as the lexicon names them; `?` where its readings differ. */
  transcription: string;
  family: SoundFamily;
  /** NoFAbet symbols of the weak sounds of that family in the word — what the notes are looked up by. */
  symbols: string[];
  /** `major` far below what native speakers score, `minor` a little below. */
  severity: 'minor' | 'major';
}

export interface ExplainSoundsInput {
  /** The language studied, spelled out (`Norwegian Bokmål`). */
  targetLanguage: string;
  /** The language the learner reads explanations in, spelled out. */
  explanationLanguage: string;
  sounds: SoundToExplain[];
}

/** The model's answer, in the order of the remarks asked about. */
export interface SoundExplanations {
  explanations: string[];
  summary: string;
}

interface RawExplanations {
  items: Array<{ index: number; explanation: string }>;
  summary: string;
}

/** One explanation per remark, by its index in the request, and a summary. Built per call: the index range. */
export function explanationsSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'summary'],
    properties: {
      items: {
        type: 'array',
        description: 'One explanation for every remark, by its index',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'explanation'],
          properties: {
            index: { type: 'integer', minimum: 0, maximum: count - 1, description: 'The remark’s index in the task' },
            explanation: {
              type: 'string',
              minLength: 1,
              description: 'How to make the sound in this word, for the learner',
            },
          },
        },
      },
      summary: { type: 'string', minLength: 1, description: 'One or two sentences on which sound to practise first' },
    },
  };
}

/** Every remark explained exactly once, and a summary that says something. */
export function verifyExplanations(count: number): (data: unknown) => string | null {
  return (data) => {
    const answer = data as RawExplanations;
    const seen = new Set<number>();
    for (const item of answer.items) {
      if (seen.has(item.index)) return `remark ${item.index} explained twice`;
      if (item.explanation.trim() === '') return `remark ${item.index} explained blank`;
      seen.add(item.index);
    }
    if (seen.size !== count) return `${count - seen.size} remark(s) not explained`;
    return answer.summary.trim() === '' ? 'summary is blank' : null;
  };
}

/** The verified answer, explanations in the order of the remarks. */
export function readExplanations(data: unknown, count: number): SoundExplanations {
  const answer = data as RawExplanations;
  const explanations = new Array<string>(count);
  for (const item of answer.items) explanations[item.index] = item.explanation.trim();
  return { explanations, summary: answer.summary.trim() };
}
