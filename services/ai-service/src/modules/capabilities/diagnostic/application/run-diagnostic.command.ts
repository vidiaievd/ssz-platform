export class RunDiagnosticCommand {
  constructor(
    readonly text: string,
    readonly actorUserId: string,
    readonly actorRole: string | null,
  ) {}
}
