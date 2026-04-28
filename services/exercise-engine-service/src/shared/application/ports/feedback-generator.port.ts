import type { Result } from '../../kernel/result.js';

export const FEEDBACK_GENERATOR = Symbol('IFeedbackGenerator');

export interface FeedbackInput {
  templateCode: string;
  correct: boolean;
  score: number;
  validationDetails: unknown;
  exerciseDefinition: unknown; // full bundle from IContentClient
  locale: string;
}

export interface FeedbackOutput {
  summary: string;
  hints?: string[];
  correctAnswer?: unknown;
}

export interface IFeedbackGenerator {
  generate(input: FeedbackInput): Promise<Result<FeedbackOutput, Error>>;
}
