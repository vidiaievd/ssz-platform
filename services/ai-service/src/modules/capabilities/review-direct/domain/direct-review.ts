import { reviewSchema, toReviewDraft, verifyReview, type ReviewFrame, type ReviewRemark } from '../../review-draft/domain/review-remarks.js';
import type { RubricCriterion, RubricHint } from '../../review-draft/domain/rubric-marks.js';

/** A model's ruling on one item of the set — a sentence, a question, the essay. */
export interface DirectDecision {
  itemId: string;
  approved: boolean;
}

/**
 * The verdict exercise-engine closes the attempt by (`PUT …/ai-review`, plan 79 step 2.1b).
 * The engine decides every item its auto-check closed and reads the model's word only on the
 * rest (Q4-C), so a decision is asked for every item and the engine keeps what it needs. An
 * essay with a rubric is ruled by its marks: `decisions` is empty and `outcome` is not read.
 */
export interface DirectVerdict {
  outcome: 'approved' | 'returned';
  decisions: DirectDecision[];
}

/**
 * A review for a learner nobody else reviews (plan 79, part 2): the remarks of `review_draft`,
 * a summary that is never missing — no teacher writes one in its place, and the engine refuses
 * a return without it — and the verdict. Marks only for an essay with a rubric, where they
 * are the ruling.
 */
export interface DirectReview {
  items: ReviewRemark[];
  summary: string;
  marks: RubricHint[] | null;
  verdict: DirectVerdict;
}

/** The property a decision on sentence N is under. */
export function sentenceKey(index: number): string {
  return `sentence_${index}`;
}

/** The property a mark on criterion N is under. */
export function criterionKey(index: number): string {
  return `criterion_${index}`;
}

interface RawDirectReview {
  decisions?: Record<string, boolean>;
  marks?: Record<string, { mark: number; reason: string }>;
  outcome: 'approved' | 'returned';
  summary: string;
}

/** The criteria the review is marked by; null when the essay's verdict is a decision, or for any other template. */
function rubricOf(frame: ReviewFrame): RubricCriterion[] | null {
  return frame.rubric && frame.rubric.length > 0 ? frame.rubric : null;
}

/**
 * The answer schema of one submission: `review_draft`'s remarks, then the ruling, then the
 * outcome and the summary — in that order, so a model that writes its answer front to back
 * has said what is wrong before it decides.
 *
 * Decisions and marks are objects with one required property per sentence or criterion
 * rather than arrays: "each exactly once" is then the schema's to enforce, not a check after
 * it, and every strict mode and the `fake` sampler produce it as they produce any object.
 */
export function directSchema(frame: ReviewFrame): Record<string, unknown> {
  const remarks = reviewSchema(frame) as { properties: Record<string, unknown> };
  const rubric = rubricOf(frame);
  const ruling = rubric
    ? { marks: marksProperty(rubric) }
    : { decisions: decisionsProperty(frame) };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', ...Object.keys(ruling), 'outcome', 'summary'],
    properties: {
      items: remarks.properties['items'],
      ...ruling,
      outcome: {
        type: 'string',
        enum: ['approved', 'returned'],
        description: 'returned when the learner should do the work again; approved otherwise',
      },
      summary: {
        type: 'string',
        minLength: 1,
        description: 'Two or three sentences to the learner on the work as a whole; when returned, why and what to do',
      },
    },
  };
}

function decisionsProperty(frame: ReviewFrame): Record<string, unknown> {
  const keys = frame.sentences.map((_, i) => sentenceKey(i + 1));
  return {
    type: 'object',
    additionalProperties: false,
    required: keys,
    description: 'For every sentence, whether its answer is acceptable',
    properties: Object.fromEntries(
      keys.map((key, i) => [key, { type: 'boolean', description: `Sentence ${i + 1}: true when acceptable, false when wrong` }]),
    ),
  };
}

function marksProperty(rubric: readonly RubricCriterion[]): Record<string, unknown> {
  const keys = rubric.map((_, i) => criterionKey(i + 1));
  return {
    type: 'object',
    additionalProperties: false,
    required: keys,
    description: 'For every rubric criterion, the mark of the text',
    properties: Object.fromEntries(
      keys.map((key, i) => [
        key,
        {
          type: 'object',
          additionalProperties: false,
          required: ['mark', 'reason'],
          description: `Criterion ${i + 1}`,
          properties: {
            mark: { type: 'integer', enum: [0, 1, 2, 3], description: 'The level whose descriptor fits the text best' },
            reason: { type: 'string', minLength: 1, description: 'One sentence to the learner on why this level' },
          },
        },
      ]),
    ),
  };
}

/**
 * What the schema cannot check: the remarks quote the answer verbatim, as in `review_draft`,
 * and the summary says something — a blank one would leave a returned learner with no reason.
 */
export function verifyDirectReview(frame: ReviewFrame): (data: unknown) => string | null {
  const verifyRemarks = verifyReview(frame);
  return (data) => verifyRemarks(data) ?? ((data as RawDirectReview).summary.trim() === '' ? 'summary is blank' : null);
}

/** The verified answer as a review: indices resolved to item and criterion ids, text trimmed. */
export function toDirectReview(data: unknown, frame: ReviewFrame): DirectReview {
  const review = data as RawDirectReview;
  // Remarks are read as the draft's are; the marks it would look for are in another shape here.
  const { items } = toReviewDraft({ items: (data as { items: unknown }).items, summary: null }, frame);
  const rubric = rubricOf(frame);
  return {
    items,
    summary: review.summary.trim(),
    marks: rubric
      ? rubric.map((criterion, i) => {
          const hint = review.marks![criterionKey(i + 1)]!;
          return { criterionId: criterion.id, mark: hint.mark as RubricHint['mark'], reason: hint.reason.trim() };
        })
      : null,
    verdict: {
      outcome: review.outcome,
      decisions: rubric
        ? []
        : frame.sentences.map((sentence, i) => ({ itemId: sentence.itemId, approved: review.decisions![sentenceKey(i + 1)]! })),
    },
  };
}
