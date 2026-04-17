import { Ajv } from 'ajv';
import { Result } from '../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../exceptions/exercise-domain.exceptions.js';

// Single shared Ajv instance — stateless, reusable across validations.
const ajv = new Ajv({ allErrors: true });

/**
 * Pure domain service — no @Injectable, no external dependencies beyond ajv.
 * Validates exercise content and expected answers against the JSON schemas
 * stored in the exercise template.
 *
 * All methods are static to make the service unambiguously side-effect-free.
 */
export class ExerciseContentValidatorService {
  /**
   * Validates exercise.content against template.contentSchema.
   * Returns Result.fail(INVALID_EXERCISE_CONTENT) with Ajv error details attached.
   */
  static validate(
    content: unknown,
    contentSchema: Record<string, unknown>,
  ): Result<void, ExerciseDomainError> {
    const validate = ajv.compile(contentSchema);
    const valid = validate(content);

    if (!valid) {
      const messages = validate.errors?.map((e) => `${e.instancePath} ${e.message}`.trim()) ?? [];
      return Result.fail<void, ExerciseDomainError>(
        `${ExerciseDomainError.INVALID_EXERCISE_CONTENT}: ${messages.join('; ')}` as ExerciseDomainError,
      );
    }

    return Result.ok();
  }

  /**
   * Validates exercise.expectedAnswers against template.answerSchema.
   * Returns Result.fail(INVALID_EXERCISE_ANSWERS) with Ajv error details attached.
   */
  static validateAnswers(
    answers: unknown,
    answerSchema: Record<string, unknown>,
  ): Result<void, ExerciseDomainError> {
    const validate = ajv.compile(answerSchema);
    const valid = validate(answers);

    if (!valid) {
      const messages = validate.errors?.map((e) => `${e.instancePath} ${e.message}`.trim()) ?? [];
      return Result.fail<void, ExerciseDomainError>(
        `${ExerciseDomainError.INVALID_EXERCISE_ANSWERS}: ${messages.join('; ')}` as ExerciseDomainError,
      );
    }

    return Result.ok();
  }
}
