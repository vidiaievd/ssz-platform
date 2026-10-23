import type { ReviewAspect } from './review-aspect.js';

/** The item id an essay's remarks carry: the text is the one "sentence" of the submission. */
export const ESSAY_ITEM_ID = 'text';

/** One must-cover point of the task, and what the engine and the learner say of it. */
export interface WritingTaskReviewPoint {
  text: string;
  required: boolean;
  /** The author's phrasings the engine looked for. */
  keywords: string[];
  /** One of the phrasings occurs in the text. */
  phrased: boolean;
  /** The learner ticked the point off. */
  ticked: boolean;
}

/**
 * A `writing_task` submission as the reviewer sees it (plan 79, step 1.7b): the task, the
 * engine's measurements and the text. There is no key to compare an essay against — the
 * author's example answer is one possible text, not a target.
 */
export interface WritingTaskReviewInput {
  /** The language learnt, spelled out (`Norwegian Bokmål`). */
  targetLanguage: string;
  /** The language the remarks are written in. */
  commentLanguage: string;
  /** `letter`, `essay`, `picture`, `retell`, `free`. */
  mode: string;
  instruction: string;
  prompt: string;
  /** `retell` only; empty otherwise. */
  source: string;
  letter: { register: string; recipient: string } | null;
  /** `picture` only; empty otherwise. */
  imageCaption: string;
  points: WritingTaskReviewPoint[];
  example: string;
  length: { words: number; paragraphs: number; minWords: number; maxWords: number };
  /** From the exercise's AI stage; never empty — with nothing to check there is no call. */
  aspects: ReviewAspect[];
  /** The whole text as `ESSAY_ITEM_ID`: what remarks quote. */
  sentences: [{ itemId: typeof ESSAY_ITEM_ID; answer: string }];
}
