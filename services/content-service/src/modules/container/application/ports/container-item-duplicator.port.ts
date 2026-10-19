import type { Visibility } from '../../domain/value-objects/visibility.vo.js';

export const CONTAINER_ITEM_DUPLICATOR = Symbol('CONTAINER_ITEM_DUPLICATOR');

export interface DuplicateRowInput {
  versionId: string;
  /** `container_items.id` of the row being duplicated. */
  rowId: string;
  /** Who duplicates — the copy is theirs, as material they had created would be. */
  userId: string;
  /** The copy lives where the module lives, so it takes the module's owner pair. */
  ownerSchoolId: string | null;
  visibility: Visibility;
}

/** The new `container_items` row placing the copy. */
export interface DuplicatedRow {
  rowId: string;
  position: number;
}

/** One exercise the copy brought into existence — what `content.exercise.created` needs. */
export interface CopiedExercise {
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
}

export interface DuplicatedExercise extends DuplicatedRow, CopiedExercise {}

export interface CopiedLessonVariant {
  variantId: string;
  explanationLanguage: string;
  minLevel: string;
  maxLevel: string;
}

export interface DuplicatedLesson extends DuplicatedRow {
  lessonId: string;
  targetLanguage: string;
  variants: CopiedLessonVariant[];
  /** Copies of the exercises the lesson's listening stages and video question point at. */
  exercises: CopiedExercise[];
}

/**
 * "Duplicate" in the structure editor (plan 39, B1): a deep copy of the material a row
 * places, placed by a new row right after the original, in the same section.
 *
 * "Place again" is the other operation — the same material under a second row — and
 * needs nothing here: it is an ordinary add.
 *
 * The copy and the placement are one transaction. A copy that landed without its row
 * would be an orphan nobody can reach from the editor; a row without its copy cannot
 * exist at all.
 */
export interface IContainerItemDuplicator {
  /**
   * Copies the exercise a row places — both documents (live and `draft_*`), its own
   * title, the skills override, every instruction, every atom target and the
   * `PRACTICED_BY` relations — and places the copy right after the row.
   *
   * Not copied: the rule exercise pools (a rule author's curated list, not a property
   * of the exercise) and content shares (grants made to one entity, not to its copies).
   *
   * Returns null when the row or the exercise it places is gone.
   */
  duplicateExerciseRow(input: DuplicateRowInput): Promise<DuplicatedExercise | null>;

  /**
   * Copies the lesson a row places — its metadata (without the slug, which is unique
   * and handed out on publish) and every live variant with its status, media refs,
   * video cues, paragraph translations, glossary marks and text spans — and places the
   * copy right after the row.
   *
   * The exercises behind listening stages and the video question are copied as well,
   * the way an exercise row would be: a stage is part of the lesson, and a copy whose
   * stages still pointed at the original's exercises would edit the original from
   * inside the copy. Media assets are shared, not copied — they are files, and the
   * narration/in-use bookkeeping already counts every variant that references one.
   *
   * Not copied: tags and content shares, as for an exercise.
   *
   * Returns null when the row or the lesson it places is gone.
   */
  duplicateLessonRow(input: DuplicateRowInput): Promise<DuplicatedLesson | null>;
}
