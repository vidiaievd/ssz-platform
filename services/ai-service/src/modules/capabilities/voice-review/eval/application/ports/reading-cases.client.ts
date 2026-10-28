import type { PromptCheck, ReadingCaseSet } from '../../domain/reading-case.js';

export const READING_CASES_CLIENT = Symbol('IReadingCasesClient');

/**
 * exercise-engine's side of the shadow run (plan 82, step 10a): the readings teachers ruled on,
 * and the reading check itself — the kernel lives there, so the candidate is measured by the
 * very rule a learner is ruled by.
 */
export interface IReadingCasesClient {
  /** Newest first. Throws when the engine cannot answer now. */
  listCases(limit: number): Promise<ReadingCaseSet>;
  /** One reading's heard prompts, checked under its mark; nothing stored. Throws when the engine cannot answer now. */
  check(
    language: string,
    passPercent: number,
    prompts: Array<{ itemId: string; text: string; transcript: string }>,
  ): Promise<PromptCheck[]>;
}
