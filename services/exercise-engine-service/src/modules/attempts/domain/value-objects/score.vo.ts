import { Result } from '../../../../shared/kernel/result.js';
import { InvalidScoreError } from '../exceptions/attempt.errors.js';

export class Score {
  private constructor(private readonly _value: number) {}

  static create(value: number): Result<Score, InvalidScoreError> {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return Result.fail(new InvalidScoreError(value));
    }
    return Result.ok(new Score(value));
  }

  passed(threshold: number): boolean {
    return this._value >= threshold;
  }

  get value(): number {
    return this._value;
  }
}
