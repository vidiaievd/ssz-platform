import { Result } from '../../kernel/result.js';
import { ValueObject } from '../value-object.base.js';

export type ContentType =
  | 'CONTAINER'
  | 'LESSON'
  | 'VOCABULARY_LIST'
  | 'GRAMMAR_RULE'
  | 'EXERCISE';

export const VALID_CONTENT_TYPES: ContentType[] = [
  'CONTAINER',
  'LESSON',
  'VOCABULARY_LIST',
  'GRAMMAR_RULE',
  'EXERCISE',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ContentRefProps {
  type: ContentType;
  id: string;
}

export class ContentRefValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentRefValidationError';
  }
}

export class ContentRef extends ValueObject<ContentRefProps> {
  private constructor(props: ContentRefProps) {
    super(props);
  }

  static create(
    type: ContentType,
    id: string,
  ): Result<ContentRef, ContentRefValidationError> {
    if (!VALID_CONTENT_TYPES.includes(type)) {
      return Result.fail(
        new ContentRefValidationError(`Invalid content type: ${type}`),
      );
    }
    if (!UUID_REGEX.test(id)) {
      return Result.fail(
        new ContentRefValidationError(`Invalid content id (must be UUID v4): ${id}`),
      );
    }
    return Result.ok(new ContentRef({ type, id }));
  }

  static fromPersistence(type: string, id: string): ContentRef {
    const ref = ContentRef.create(type as ContentType, id);
    if (ref.isFail) throw new Error(`Cannot restore ContentRef: ${ref.error.message}`);
    return ref.value;
  }

  get type(): ContentType {
    return this.props.type;
  }

  get id(): string {
    return this.props.id;
  }

  toString(): string {
    return `${this.props.type}:${this.props.id}`;
  }
}
