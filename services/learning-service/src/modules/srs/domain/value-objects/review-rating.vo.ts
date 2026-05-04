import { ValueObject } from '../../../../shared/domain/value-object.base.js';

export type ReviewRatingValue = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

interface ReviewRatingProps {
  value: ReviewRatingValue;
}

export class ReviewRating extends ValueObject<ReviewRatingProps> {
  static readonly AGAIN = new ReviewRating({ value: 'AGAIN' });
  static readonly HARD = new ReviewRating({ value: 'HARD' });
  static readonly GOOD = new ReviewRating({ value: 'GOOD' });
  static readonly EASY = new ReviewRating({ value: 'EASY' });

  private constructor(props: ReviewRatingProps) {
    super(props);
  }

  static fromString(value: string): ReviewRating {
    switch (value) {
      case 'AGAIN': return ReviewRating.AGAIN;
      case 'HARD':  return ReviewRating.HARD;
      case 'GOOD':  return ReviewRating.GOOD;
      case 'EASY':  return ReviewRating.EASY;
      default: throw new Error(`Invalid ReviewRating: ${value}`);
    }
  }

  get value(): ReviewRatingValue {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
