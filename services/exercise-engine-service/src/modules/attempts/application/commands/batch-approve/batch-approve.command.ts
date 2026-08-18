/**
 * Approve a named list of submissions the machine had already closed.
 *
 * The list is the caller's, never the server's: the modal showed the teacher these
 * learners by name and it is those submissions that must be acted on, not "everything
 * clean in the group" as the server sees it a moment later (§5 of the contract).
 *
 * `schoolId` is required of every review route (plan 44 §0.2). The engine authorises
 * nothing, so the caller states whose submissions it believes it is approving, and one
 * belonging to another school is skipped as if it did not exist.
 */
export class BatchApproveCommand {
  constructor(
    public readonly schoolId: string,
    public readonly reviewerId: string,
    public readonly attemptIds: string[],
  ) {}
}
