import { Result } from '../../../../shared/kernel/result.js';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_LENGTH = 80;

export class TagSlug {
  private constructor(private readonly _value: string) {}

  static create(raw: string): Result<TagSlug, string> {
    if (!raw || raw.length === 0) {
      return Result.fail('Tag slug must not be empty');
    }
    if (raw.length > MAX_LENGTH) {
      return Result.fail(`Tag slug must be at most ${MAX_LENGTH} characters`);
    }
    if (!SLUG_REGEX.test(raw)) {
      return Result.fail(
        'Tag slug must be lowercase kebab-case (letters, digits, hyphens between words)',
      );
    }
    return Result.ok(new TagSlug(raw));
  }

  get value(): string {
    return this._value;
  }

  equals(other: TagSlug): boolean {
    return this._value === other._value;
  }
}
