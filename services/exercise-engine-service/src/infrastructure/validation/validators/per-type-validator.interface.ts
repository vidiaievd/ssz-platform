import type { Result } from '../../../shared/kernel/result.js';
import type { ValidationError, ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';

export interface PerTypeValidateInput {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  /**
   * exercise.content. Optional here although the dispatcher always passes it: only
   * word_bank_gap_fill reads it (its answers live inside the content), and the other
   * nine validators would otherwise have to name a field they never look at.
   */
  content?: unknown;
  checkSettings: Record<string, unknown>;
  targetLanguage: string;
}

export interface IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError>;
}
