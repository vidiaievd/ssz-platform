import type { Placement } from '@ssz/shared-kernel/sentence-schema';

export class CheckRowCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** Which sentence of the set is being checked. */
    public readonly rowId: string,
    /** The board: `fieldId → item ids`, in the order the student stacked them. */
    public readonly placement: Placement,
    /**
     * The student pressed `Vis riktig skjema` instead of checking.
     *
     * The board they had is still recorded, but nothing is graded from it: the sentence
     * closes, the solution comes back, and it scores nothing.
     */
    public readonly reveal: boolean,
  ) {}
}
