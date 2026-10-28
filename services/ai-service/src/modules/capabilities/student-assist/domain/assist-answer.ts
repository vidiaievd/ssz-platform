/** What the learner is looking at when they ask (plan 83, §3). Ids come from the client, unchecked here. */
export type AssistContextKind = 'free' | 'unit' | 'submission' | 'class' | 'word';

export interface AssistContext {
  kind: AssistContextKind;
  courseId?: string;
  unitId?: string;
  attemptId?: string;
  exerciseId?: string;
  lessonId?: string;
  lemma?: string;
}

export type AssistCitationKind = 'grammar_rule' | 'lesson' | 'vocabulary_item' | 'unit';

const CITATION_KINDS: readonly AssistCitationKind[] = ['grammar_rule', 'lesson', 'vocabulary_item', 'unit'];

/** Something a tool returned in this turn that the answer may cite. Titles are ours, never the model's. */
export interface AssistSource {
  kind: AssistCitationKind;
  id: string;
  title: string;
  unitId?: string;
  courseId?: string;
}

/**
 * What the answer is checked against: the sources tools returned in this turn, and every text
 * the model has seen in it — the history, the message, the tool results. The agent loop
 * (step 4) gathers it round by round; a source from an earlier turn is not citable, because
 * the phone's history carries no tool results (Q1 = A).
 */
export interface AssistEvidence {
  sources: readonly AssistSource[];
  texts: readonly string[];
}

export interface AssistBlock {
  type: 'text' | 'example';
  text: string;
  /** Spans of `text` to stress, `[start, end)` in UTF-16 code units — what JS strings index by. */
  emphasis?: [number, number][];
}

export type AssistSuggestion =
  | { kind: 'ask'; text: string }
  | { kind: 'add_word'; lemma: string; translation?: string }
  | { kind: 'open'; target: AssistSource };

/** The answer as the learner's client receives it (§3, minus `callId`). */
export interface AssistAnswer {
  blocks: AssistBlock[];
  citations: AssistSource[];
  suggestions: AssistSuggestion[];
}

interface RawRef {
  kind: AssistCitationKind;
  id: string;
}

interface RawAnswer {
  blocks: { type: 'text' | 'example'; text: string; emphasis: [number, number][] }[];
  citations: RawRef[];
  suggestions: {
    kind: 'ask' | 'add_word' | 'open';
    text: string | null;
    lemma: string | null;
    translation: string | null;
    target: RawRef | null;
  }[];
}

const MAX_BLOCKS = 6;
const MAX_CITATIONS = 6;
const MAX_SUGGESTIONS = 3;

function refSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'id'],
    description,
    properties: {
      kind: { type: 'string', enum: CITATION_KINDS },
      id: { type: 'string', minLength: 1, description: 'The id exactly as a tool returned it in this conversation turn' },
    },
  };
}

/**
 * The answer schema. Every property is required and the optional ones are nullable rather than
 * absent, so strict structured-output modes accept it as written. A suggestion is one flat
 * object whose `kind` says which fields it uses — the verifier holds it to that — because a
 * union of objects is where strict modes and the `fake` sampler part ways.
 */
export function assistSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['blocks', 'citations', 'suggestions'],
    properties: {
      blocks: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_BLOCKS,
        description: 'The answer, in order: explanation as `text`, a sentence in the target language as `example`',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'text', 'emphasis'],
          properties: {
            type: { type: 'string', enum: ['text', 'example'] },
            text: { type: 'string', minLength: 1, maxLength: 800 },
            emphasis: {
              type: 'array',
              maxItems: 4,
              description: 'Character spans [start, end) of this block\'s text to stress; empty for none',
              items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'integer', minimum: 0 } },
            },
          },
        },
      },
      citations: {
        type: 'array',
        maxItems: MAX_CITATIONS,
        description: 'The course material the answer rests on; only what a tool returned in this turn',
        items: refSchema('A piece of course material'),
      },
      suggestions: {
        type: 'array',
        maxItems: MAX_SUGGESTIONS,
        description: 'Next steps offered to the learner; empty when none fits',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text', 'lemma', 'translation', 'target'],
          properties: {
            kind: {
              type: 'string',
              enum: ['ask', 'add_word', 'open'],
              description: 'ask — a follow-up question (`text`); add_word — a word to save (`lemma`, `translation`); open — material to open (`target`)',
            },
            text: { type: ['string', 'null'], maxLength: 120 },
            lemma: { type: ['string', 'null'], maxLength: 60 },
            translation: { type: ['string', 'null'], maxLength: 120 },
            target: { anyOf: [{ type: 'null' }, refSchema('Material to open')] },
          },
        },
      },
    },
  };
}

function sourceOf(evidence: AssistEvidence, ref: RawRef): AssistSource | null {
  return evidence.sources.find((s) => s.kind === ref.kind && s.id === ref.id) ?? null;
}

function fold(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase();
}

/** Whether `word` stands as a whole word in `text`, ignoring case: «bil» is in «En bil.», not in «bilen». */
export function occursAsWord(word: string, text: string): boolean {
  const needle = fold(word.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (needle === '') return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${needle}(?![\\p{L}\\p{N}])`, 'u').test(fold(text));
}

function blank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

/**
 * What the schema cannot check (R-e). A citation the tools did not return is an invented
 * reference — the learner would open material that is not there or is someone else's; a word
 * to save that nobody wrote is an invented word. Either fails the whole answer, as an invented
 * fragment fails a draft.
 */
export function verifyAssistAnswer(evidence: AssistEvidence): (data: unknown) => string | null {
  return (data) => {
    const answer = data as RawAnswer;
    for (const [i, block] of answer.blocks.entries()) {
      if (block.text.trim() === '') return `block ${i + 1} is blank`;
      for (const [start, end] of block.emphasis) {
        if (start >= end || end > block.text.length) return `block ${i + 1}: emphasis [${start}, ${end}] is outside its text`;
      }
    }
    for (const [i, ref] of answer.citations.entries()) {
      if (!sourceOf(evidence, ref)) return `citation ${i + 1}: ${ref.kind} "${ref.id}" was not returned by a tool in this turn`;
    }
    for (const [i, s] of answer.suggestions.entries()) {
      const at = `suggestion ${i + 1} (${s.kind})`;
      switch (s.kind) {
        case 'ask':
          if (blank(s.text)) return `${at} has no text`;
          break;
        case 'add_word':
          if (blank(s.lemma)) return `${at} has no lemma`;
          if (!evidence.texts.some((text) => occursAsWord(s.lemma!, text))) {
            return `${at}: "${s.lemma}" occurs nowhere in the conversation or the tool results`;
          }
          break;
        case 'open':
          if (!s.target) return `${at} has no target`;
          if (!sourceOf(evidence, s.target)) return `${at}: ${s.target.kind} "${s.target.id}" was not returned by a tool in this turn`;
          break;
      }
    }
    return null;
  };
}

/**
 * The verified answer for the client: references resolved to the sources' own titles and
 * locations, citations deduplicated, unused nullable fields dropped. Block text is kept as
 * written — trimming would move the emphasis spans.
 */
export function toAssistAnswer(data: unknown, evidence: AssistEvidence): AssistAnswer {
  const answer = data as RawAnswer;
  const citations: AssistSource[] = [];
  for (const ref of answer.citations) {
    const source = sourceOf(evidence, ref)!;
    if (!citations.includes(source)) citations.push(source);
  }
  return {
    blocks: answer.blocks.map((b) => (b.emphasis.length > 0 ? { type: b.type, text: b.text, emphasis: b.emphasis } : { type: b.type, text: b.text })),
    citations,
    suggestions: answer.suggestions.map((s): AssistSuggestion => {
      switch (s.kind) {
        case 'ask':
          return { kind: 'ask', text: s.text!.trim() };
        case 'add_word':
          return blank(s.translation)
            ? { kind: 'add_word', lemma: s.lemma!.trim() }
            : { kind: 'add_word', lemma: s.lemma!.trim(), translation: s.translation!.trim() };
        case 'open':
          return { kind: 'open', target: sourceOf(evidence, s.target!)! };
      }
    }),
  };
}
