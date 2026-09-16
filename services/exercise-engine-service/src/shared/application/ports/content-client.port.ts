import type { Focus, Modality, Skill } from '@ssz/contracts';
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
  /**
   * What each piece of the exercise is about (plan 63 §2 D), on the same envelope and
   * for the same reason as the axes: the address has to be snapshotted onto the attempt
   * at the instant it starts.
   *
   * Optional and empty by default — a Content Service that predates the address answers
   * without it, and most of the catalogue has none.
   */
  targets?: Array<{
    itemKey: string | null;
    atomType: string;
    atomId: string;
    role: string;
  }>;
  /**
   * This definition came from a disposable task rather than from the catalogue —
   * plan 63 phase 9.
   *
   * Absent and false mean the same thing, which is the common case: an exercise an author
   * wrote and a course points at. `true` says the task is a probe — nobody maintains it,
   * nothing in a course points at it, and it will not exist tomorrow.
   *
   * It rides on the envelope so that the attempt can snapshot it, and the attempt has to,
   * because the probe outlives nothing: by the time a teacher marks the work or a
   * consumer reads the event, the row it was resolved from may be gone. Everything
   * downstream that must not write catalogue-shaped state against an id with no future
   * reads the attempt, never the probe table.
   */
  ephemeral?: boolean;
}

/** One template, as the engine needs it to run an attempt on a task. */
export interface ExerciseTemplateDefinition {
  code: string;
  contentSchema: unknown;
  answerSchema: unknown;
  defaultCheckSettings: Record<string, unknown>;
  supportedLanguages: string[] | null;
  isActive: boolean;
}

/** The axes as Content Service resolves them. Sources are for authors, not for attempts. */
export interface ExerciseAxes {
  skills: Skill[];
  focus: Focus[];
  form?: string;
  /** How the learner had to produce the answer (plan 63 §2 E). */
  modality?: Modality;
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
  /** Who authored the course — the only thing a personal course says about whose it is. */
  ownerUserId: string | null;
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
  getExercisePlacement(exerciseId: string): Promise<Result<ExercisePlacement, ContentClientError>>;

  /**
   * One template by the code a document names it with (plan 63 phase 9).
   *
   * Every other route here is addressed by exercise id, because every other task the
   * engine runs is a catalogue exercise and arrives with its template attached. A probe
   * has no id in the catalogue and carries only a code, and its answer schema and check
   * settings have to come from the same place a catalogue exercise's do — a schema
   * snapshotted onto the task at the moment it was written would drift away from the one
   * every other attempt is judged against.
   */
  getTemplateByCode(code: string): Promise<Result<ExerciseTemplateDefinition, ContentClientError>>;
}
