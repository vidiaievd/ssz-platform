import type { Result } from '../../kernel/result.js';

export const CONTENT_CLIENT = Symbol('IContentClient');

export interface ExerciseInstruction {
  language: string;
  text: string;
  hint: string | null;
  overrides: Record<string, unknown> | null;
}

export interface ExerciseDefinition {
  exercise: {
    id: string;
    templateCode: string;
    targetLanguage: string;
    difficultyLevel: string;
    content: unknown;
    expectedAnswers: unknown;
    answerCheckSettings: Record<string, unknown> | null;
  };
  template: {
    code: string;
    contentSchema: unknown;
    answerSchema: unknown;
    defaultCheckSettings: Record<string, unknown>;
    supportedLanguages: string[] | null;
  };
  instruction: ExerciseInstruction | null;
}

export class ContentClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ContentClientError';
  }
}

export interface IContentClient {
  getExerciseForAttempt(
    exerciseId: string,
    language: string,
  ): Promise<Result<ExerciseDefinition, ContentClientError>>;
}
