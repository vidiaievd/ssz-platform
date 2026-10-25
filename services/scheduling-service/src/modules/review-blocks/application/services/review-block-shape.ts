import { UnprocessableEntityException } from '@nestjs/common';
import {
  checkReviewBlockShape,
  type ReviewBlockShape,
  type ReviewBlockShapeError,
} from '../../domain/entities/review-block.entity.js';

const MESSAGES: Record<ReviewBlockShapeError, string> = {
  INVALID_TIME: 'Times are HH:MM, from 00:00 to 23:59',
  END_TIME_NOT_AFTER_START: 'A block ends after it starts, within the same day',
  ENDS_BEFORE_START: 'A series cannot end before its first day',
  ONE_OFF_SPANS_DAYS: 'A one-off block takes a single day',
};

/** The domain's rules as the 422 a caller can act on. */
export function requireReviewBlockShape(shape: ReviewBlockShape): void {
  const error = checkReviewBlockShape(shape);
  if (error) throw new UnprocessableEntityException({ code: error, message: MESSAGES[error] });
}
