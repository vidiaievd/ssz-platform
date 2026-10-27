import type { ReadingToCheck } from '../../../domain/reading-verdict.js';

/** The reading check on what was heard, without an attempt to rule on (plan 82, step 10). */
export class CheckReadingsQuery {
  constructor(
    readonly language: string,
    readonly passPercent: number,
    readonly readings: ReadingToCheck[],
  ) {}
}
