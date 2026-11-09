/** The learner asks for a grammar atom they have reached to be reviewed (plan 85, step 6). */
export class AddReachedAtomCommand {
  constructor(
    public readonly userId: string,
    public readonly atomId: string,
    /** The course the atom was offered in — "reached" is a fact about a course (Q1). */
    public readonly courseId: string,
  ) {}
}
