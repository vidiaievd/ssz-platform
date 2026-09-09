import type { Result } from '../../kernel/result.js';

export const ANSWER_VALIDATOR = Symbol('IAnswerValidator');

export interface ValidateAnswerInput {
  templateCode: string;
  answerSchema: unknown;        // JSON Schema from Content Service template
  expectedAnswers: unknown;     // exercise.expectedAnswers
  // exercise.content. Needed because word_bank_gap_fill stores each sentence
  // solved, so its answers are tokens inside the content rather than a separate
  // key. Every other validator ignores it.
  content: unknown;
  submittedAnswer: unknown;
  checkSettings: Record<string, unknown>; // merged: template.defaultCheckSettings + exercise override
  targetLanguage: string;
}

export interface ValidationOutcome {
  correct: boolean;
  score: number;          // 0–100
  details: unknown;       // validator-specific breakdown stored on the attempt
  requiresReview: boolean; // true → free-form route to Learning Service
  /**
   * Whether the score is a pass, when the validator is the one that knows.
   *
   * Omitted by every template whose pass mark is the platform's — the submit handler
   * compares the score with `checkSettings.passingThreshold`, defaulting to 70, and that
   * is right for a type whose author never chose a threshold.
   *
   * `multiple_choice_group` did choose one: `settings.passThreshold` is a field of the
   * document, set in step 3 of its builder and shown to the student as «kravet er T%»
   * (plan 54 §3.4). A handler comparing against 70 would quietly disagree with the number
   * on the author's screen and with the one in the student's summary.
   */
  passed?: boolean;
}

export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface IAnswerValidator {
  validate(input: ValidateAnswerInput): Promise<Result<ValidationOutcome, ValidationError>>;
}
