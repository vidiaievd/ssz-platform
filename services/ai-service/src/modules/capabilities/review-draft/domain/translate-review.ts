import type { ReviewAspect } from './review-aspect.js';

/**
 * A `translate_*` submission as the reviewer sees it: one entry per sentence of the set,
 * the author's key beside the learner's answer. Built by the caller from the exercise and
 * the attempt (plan 79, step 1.3); ai-service holds no copy of the template.
 */
export interface TranslateReviewSentence {
  itemId: string;
  direction: 'to_target' | 'from_target';
  source: string;
  /** Accepted translations, with the template's inline `(a|b)` alternatives unexpanded. */
  refs: string[];
  answer: string;
  /** Why the key reads the way it does — the author's own words. */
  explanation?: string;
  /** Meant for the teacher only; context, never quoted back. */
  teacherNote?: string;
}

export interface TranslateReviewInput {
  /** The template's language labels — free text, e.g. `{ explain: 'Russisk', target: 'Norsk' }`. */
  langs: { explain: string; target: string };
  /** The language the remarks are written in: the school's explanation language. */
  commentLanguage: string;
  /** Enabled `ai.checks` aspects; never empty — with nothing to check there is no call. */
  aspects: ReviewAspect[];
  sentences: TranslateReviewSentence[];
}

/** One remark of the draft, tied to the sentence it is about. */
export interface ReviewRemark {
  itemId: string;
  /** 1-based, as numbered in the prompt. */
  sentenceIndex: number;
  aspect: ReviewAspect;
  /** Occurs verbatim in that sentence's answer — checked before the draft is accepted. */
  fragment: string;
  comment: string;
  suggestion: string | null;
}

export interface ReviewDraft {
  items: ReviewRemark[];
  summary: string | null;
}

/** The answer as the model returns it; `sentenceIndex` is mapped to an item id afterwards. */
interface RawRemark {
  sentenceIndex: number;
  aspect: ReviewAspect;
  fragment: string;
  comment: string;
  suggestion: string | null;
}

interface RawReview {
  items: RawRemark[];
  summary: string | null;
}

/**
 * The answer schema for one submission. Built per call: the aspect enum is exactly the
 * enabled checks and the index range is the size of this set, so a remark on a switched-off
 * aspect or a sentence that does not exist fails the schema rather than reaching a teacher.
 *
 * Optional values are required-and-nullable rather than absent — the form strict modes
 * (OpenAI `strict`, Anthropic native) accept without rewriting.
 */
export function translateReviewSchema(input: TranslateReviewInput): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'summary'],
    properties: {
      items: {
        type: 'array',
        description: 'Remarks on errors; empty when every answer is acceptable',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sentenceIndex', 'aspect', 'fragment', 'comment', 'suggestion'],
          properties: {
            sentenceIndex: {
              type: 'integer',
              minimum: 1,
              maximum: input.sentences.length,
              description: 'Number of the sentence the remark is about, as numbered in the task',
            },
            aspect: { type: 'string', enum: [...input.aspects] },
            fragment: {
              type: 'string',
              minLength: 1,
              description: "The erroneous part, copied character for character from the learner's answer",
            },
            comment: { type: 'string', minLength: 1, description: 'Explanation of the error, for the learner' },
            suggestion: {
              type: ['string', 'null'],
              description: 'Corrected text that replaces the fragment; null when there is no single fix',
            },
          },
        },
      },
      summary: { type: ['string', 'null'], description: 'One or two sentences on the whole answer, or null' },
    },
  };
}

/**
 * What the schema cannot check: every remark quotes its own sentence's answer verbatim.
 * A fragment the learner did not write is an invented quotation — the draft would point a
 * teacher at text that is not there — so the whole answer is refused, not just the remark.
 */
export function verifyTranslateReview(input: TranslateReviewInput): (data: unknown) => string | null {
  return (data) => {
    const review = data as RawReview;
    for (const [i, remark] of review.items.entries()) {
      const sentence = input.sentences[remark.sentenceIndex - 1];
      if (!sentence) return `remark ${i + 1}: sentence ${remark.sentenceIndex} does not exist`;
      if (remark.fragment.trim() === '') return `remark ${i + 1}: fragment is blank`;
      if (!sentence.answer.includes(remark.fragment)) {
        return `remark ${i + 1}: fragment "${remark.fragment}" does not occur in the answer to sentence ${remark.sentenceIndex}`;
      }
    }
    return null;
  };
}

/** The verified answer as a draft: indices resolved to item ids, blank text normalised. */
export function toReviewDraft(data: unknown, input: TranslateReviewInput): ReviewDraft {
  const review = data as RawReview;
  return {
    items: review.items.map((remark) => ({
      itemId: input.sentences[remark.sentenceIndex - 1]!.itemId,
      sentenceIndex: remark.sentenceIndex,
      aspect: remark.aspect,
      fragment: remark.fragment,
      comment: remark.comment.trim(),
      suggestion: remark.suggestion?.trim() ? remark.suggestion.trim() : null,
    })),
    summary: review.summary?.trim() ? review.summary.trim() : null,
  };
}
