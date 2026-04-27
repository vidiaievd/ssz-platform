import type { Result } from '../../kernel/result.js';

export const ANSWER_VALIDATOR = Symbol('IAnswerValidator');

export interface ValidateAnswerInput {
  templateCode: string;
  answerSchema: unknown;        // JSON Schema from Content Service template
  expectedAnswers: unknown;     // exercise.expectedAnswers
  submittedAnswer: unknown;
  checkSettings: Record<string, unknown>; // merged: template.defaultCheckSettings + exercise override
  targetLanguage: string;
}

export interface ValidationOutcome {
  correct: boolean;
  score: number;          // 0–100
  details: unknown;       // validator-specific breakdown stored on the attempt
  requiresReview: boolean; // true → free-form route to Learning Service
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
