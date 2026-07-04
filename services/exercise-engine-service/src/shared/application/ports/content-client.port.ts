import type { Result } from '../../kernel/result.js';

export const CONTENT_CLIENT = Symbol('IContentClient');

// PRACTICE ships expectedAnswers for zero-latency local checking; GRADED withholds
// them so the client can't read the correct answer before the server scores it.
export type CheckMode = 'PRACTICE' | 'GRADED';

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

// Atom that this exercise practices, from the ContentRelation graph (PRACTICED_BY,
// atom → exercise). atomType mirrors Content Service's RelatableEntityType values
// ('vocabulary_item' | 'grammar_rule' | ...).
export interface PracticedAtomRef {
  atomType: string;
  atomId: string;
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
    mode: CheckMode,
  ): Promise<Result<ExerciseDefinition, ContentClientError>>;

  /** Snapshotted once at attempt start so scoring never makes a cross-service call. */
  getPracticedAtoms(exerciseId: string): Promise<Result<PracticedAtomRef[], ContentClientError>>;
}
