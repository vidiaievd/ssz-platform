import type { ReviewAspect } from './review-aspect.js';

/** One thing the answer had to say, and whether the phrase match found it said. */
export interface ShortAnswerReviewElement {
  label: string;
  required: boolean;
  /** One of the author's anchor phrases occurs in the answer. */
  hit: boolean;
}

/** One answered question as the reviewer sees it. */
export interface ShortAnswerReviewQuestion {
  itemId: string;
  /** `reading`, `listening`, `opinion`. */
  kind: string;
  /** The text, or the audio's transcript, the question is about; empty for `opinion`. */
  passage: string;
  prompt: string;
  /** The author's own answer. */
  model: string;
  /** The author's explanation of what the answer had to say; empty when there is none. */
  why: string;
  elements: ShortAnswerReviewElement[];
  /** The phrase match's verdict: `pass`, `partial`, `fail`. */
  verdict: string;
  tooShort: boolean;
  /** The learner's answer — what remarks quote. */
  answer: string;
}

/**
 * A `short_answer` submission as the reviewer sees it (plan 79, step 1.7e): open questions on
 * a text, each with the author's key points and what the phrase match made of the answer.
 * Built by exercise-engine; ai-service holds no copy of the template.
 */
export interface ShortAnswerReviewInput {
  /** The language learnt, spelled out (`Norwegian Bokmål`). */
  targetLanguage: string;
  /** The language the remarks are written in. */
  commentLanguage: string;
  instruction: string;
  /** From the exercise's AI stage; never empty — `content` is always on with the stage. */
  aspects: ReviewAspect[];
  questions: ShortAnswerReviewQuestion[];
  /** One per question, in order: what remarks quote and point at by index. */
  sentences: Array<{ itemId: string; answer: string }>;
}
