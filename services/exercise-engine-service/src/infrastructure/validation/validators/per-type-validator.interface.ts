import type { Result } from '../../../shared/kernel/result.js';
import type { ValidationError, ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';

export interface PerTypeValidateInput {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  checkSettings: Record<string, unknown>;
  targetLanguage: string;
}

export interface IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError>;
}
