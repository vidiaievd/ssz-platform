import type { AiFeedback, AiFeedbackItem, AiFeedbackKind } from '@ssz/contracts';
import type { ReviewAspect } from '../../review-draft/domain/review-aspect.js';
import { reviewSchema, verifyReview, type ReviewFrame } from '../../review-draft/domain/review-remarks.js';
import { describedAtomRefOf, EMPTY_CATALOG, type AtomCatalog } from '../../grammar-atoms/domain/atom-catalog.js';

/**
 * The answer of a rehearsal (plan 84): the remarks of `review_draft` without the corrected
 * text — a hint the learner fixes the work by, not the fix — each with a severity, and a
 * summary that is never missing, since nobody else writes one before the learner reads it.
 */

const SEVERITIES = ['minor', 'major'] as const;

interface RawPracticeRemark {
  sentenceIndex: number;
  aspect: ReviewAspect;
  fragment: string | null;
  comment: string;
  severity: (typeof SEVERITIES)[number];
  /** Only in a request that carried the learner's grammar atoms (`practice@2`). */
  atomId?: string | null;
}

interface RawPractice {
  items: RawPracticeRemark[];
  summary: string;
}

/** What a remark of each aspect is about, in the contract's terms. */
const KIND_OF: Record<ReviewAspect, AiFeedbackKind> = {
  grammar: 'grammar',
  order: 'grammar',
  lexis: 'lexis',
  register: 'lexis',
  alternative: 'content',
  task: 'content',
  structure: 'content',
  content: 'content',
};

/**
 * The draft's remark schema with `suggestion` taken out and `severity` put in, and a required
 * summary. The aspect enum and the sentence range stay the draft's: built per call.
 */
export function practiceSchema(frame: ReviewFrame): Record<string, unknown> {
  const draft = reviewSchema(frame) as { properties: { items: { items: { properties: Record<string, unknown> } } } };
  const { suggestion: _suggestion, ...remark } = draft.properties.items.items.properties;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'summary'],
    properties: {
      items: {
        type: 'array',
        description: 'Hints on errors; empty when there is nothing worth reporting',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sentenceIndex', 'aspect', 'fragment', 'comment', 'severity'],
          properties: {
            ...remark,
            comment: {
              type: 'string',
              minLength: 1,
              description: 'What is wrong here and which rule, for the learner — never the corrected form',
            },
            severity: {
              type: 'string',
              enum: [...SEVERITIES],
              description: 'major when the error changes or hides the meaning; minor for a slip',
            },
          },
        },
      },
      summary: { type: 'string', minLength: 1, description: 'One or two sentences to the learner on where the work stands' },
    },
  };
}

/** The draft's check — every quotation is the learner's own — and a summary that says something. */
export function verifyPractice(frame: ReviewFrame): (data: unknown) => string | null {
  const verifyRemarks = verifyReview(frame);
  return (data) => verifyRemarks(data) ?? ((data as RawPractice).summary.trim() === '' ? 'summary is blank' : null);
}

/**
 * The verified answer in the contract's shape. A remark points at its answer by
 * `passageIndex` (0-based, the prompt's sentence number less one) and, when it quotes, at the
 * first occurrence of the quotation in that answer by `span`. A grammar remark names an atom
 * only from the catalogue the request carried, with the learner's standing on it; any other id is dropped (plan 85 §1, rule 4).
 */
export function toAiFeedback(data: unknown, frame: ReviewFrame, catalog: AtomCatalog = EMPTY_CATALOG): AiFeedback {
  const answer = data as RawPractice;
  return {
    summary: answer.summary.trim(),
    items: answer.items.map((remark): AiFeedbackItem => {
      const passageIndex = remark.sentenceIndex - 1;
      const start = remark.fragment === null ? -1 : frame.sentences[passageIndex]!.answer.indexOf(remark.fragment);
      return {
        kind: KIND_OF[remark.aspect],
        target: start >= 0 ? { passageIndex, span: [start, start + remark.fragment!.length] } : { passageIndex },
        ...(remark.fragment !== null ? { original: remark.fragment } : {}),
        explanation: remark.comment.trim(),
        atomRef: describedAtomRefOf(remark.atomId, remark.aspect, catalog),
        severity: remark.severity,
      };
    }),
  };
}
