export class RemindReviewerCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly teacherId: string,
    /** How many submissions the message will mention — one message, one number. */
    public readonly pending: number,
  ) {}
}
