// Called by the Learning Service via an internal endpoint after enrollments have been migrated.
// No userId — this is a service-to-service operation.
export class ArchiveVersionCommand {
  constructor(public readonly versionId: string) {}
}
