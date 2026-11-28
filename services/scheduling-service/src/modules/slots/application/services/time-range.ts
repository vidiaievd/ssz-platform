import { UnprocessableEntityException } from '@nestjs/common';
import { checkTimeRange, TIME_RANGE_MESSAGES } from '../../domain/time-range.js';

/** The domain's rule as the 422 a caller can act on (`code` + `message`). */
export function requireTimeRange(startTime: string, endTime: string): void {
  const error = checkTimeRange(startTime, endTime);
  if (error) throw new UnprocessableEntityException({ code: error, message: TIME_RANGE_MESSAGES[error] });
}
