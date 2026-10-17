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

export interface DuplicatedExercise {
  /** The new `container_items` row. */
  rowId: string;
  position: number;
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
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
}
