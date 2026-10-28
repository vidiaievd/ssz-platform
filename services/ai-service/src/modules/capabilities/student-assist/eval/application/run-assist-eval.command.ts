/**
 * A platform_admin measures a candidate model on the assistant's hand-written set before
 * binding it to `student_assist` (plan 83, step 8).
 */
export class RunAssistEvalCommand {
  constructor(
    readonly modelId: string,
    /** Null = the binding's. */
    readonly promptVersion: string | null,
    readonly actorUserId: string,
  ) {}
}
