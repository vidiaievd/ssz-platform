import type { Focus, Skill } from '@ssz/contracts';
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
  /**
   * What the exercise trains (plan 55 §3.6), derived by Content Service off the live
   * document, its placement and the author's override.
   *
   * It rides on the envelope the engine already fetches at attempt start rather than
   * being asked for separately: the axes have to be snapshotted onto the attempt at the
   * same instant `practicedAtoms` is, and a second round trip would be a second instant.
   *
   * Optional because a Content Service that predates the axes answers without them —
   * the attempt then reports no axes rather than failing to start.
   */
  axes?: ExerciseAxes;
}

/** The axes as Content Service resolves them. Sources are for authors, not for attempts. */
export interface ExerciseAxes {
  skills: Skill[];
  focus: Focus[];
  form?: string;
}

// Atom that this exercise practices, from the ContentRelation graph (PRACTICED_BY,
// atom → exercise). atomType mirrors Content Service's RelatableEntityType values
// ('vocabulary_item' | 'grammar_rule' | ...).
export interface PracticedAtomRef {
  atomType: string;
  atomId: string;
}

// Where an exercise sits — snapshotted onto the attempt at start (plan 44 §44.1/§44.4)
// so the review queue and oversight never need a live join back to Content Service.
export interface ExercisePlacement {
  containerId: string;
  containerTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  exerciseTitle: string | null;
  ownerSchoolId: string | null;
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

  /** Best-effort at attempt start (plan 44 §44.4) — a miss must not block starting. */
  getExercisePlacement(
    exerciseId: string,
  ): Promise<Result<ExercisePlacement, ContentClientError>>;
}
