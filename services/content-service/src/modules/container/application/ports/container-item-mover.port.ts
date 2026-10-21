export const CONTAINER_ITEM_MOVER = Symbol('CONTAINER_ITEM_MOVER');

export interface MoveRowInput {
  /** The draft holding the row now. */
  sourceVersionId: string;
  /** `container_items.id` of the row being moved. */
  rowId: string;
  /** The draft of the container the row moves to. */
  targetVersionId: string;
  /** A section of the target draft, or null for none. */
  targetSectionId: string | null;
}

/** The row the material lands in — a row of another version is another row. */
export interface MovedRow {
  rowId: string;
  position: number;
}

/**
 * «Move to → Another module» in the structure editor (plan 39, B3): the material a
 * row places leaves one container's draft and lands in another's, as one transaction.
 * A move that stopped halfway would either lose the material from both or show it in
 * both, and only the second looks like a mistake.
 */
export interface IContainerItemMover {
  /**
   * Deletes the row from the source draft and places the same material last in the
   * target section, with the row's flags; bumps the revision of both drafts. The
   * source keeps a gap where the row was, as after a removal.
   *
   * Returns null when the row is no longer in the source draft.
   */
  moveRow(input: MoveRowInput): Promise<MovedRow | null>;
}
