import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { checkReadings, type PromptCheckCount } from '../../../domain/reading-verdict.js';
import { CheckReadingsQuery } from './check-readings.query.js';

/**
 * The machine's pass or fail on each prompt of a reading, from what a speech model heard —
 * the kernel's check, as a learner's verdict would stand on it. ai-service holds no checker of
 * its own: a shadow run (plan 82, step 10) asks here, so it measures the very rule it would serve.
 */
@QueryHandler(CheckReadingsQuery)
export class CheckReadingsHandler implements IQueryHandler<CheckReadingsQuery, PromptCheckCount[]> {
  execute(query: CheckReadingsQuery): Promise<PromptCheckCount[]> {
    return Promise.resolve(checkReadings(query.language, query.passPercent, query.readings));
  }
}
