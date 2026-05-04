import type { ReviewRatingValue } from '../../domain/value-objects/review-rating.vo.js';

export class ReviewCardCommand {
  constructor(
    public readonly userId: string,
    public readonly cardId: string,
    public readonly rating: ReviewRatingValue,
    public readonly reviewedAt?: Date,
  ) {}
}
