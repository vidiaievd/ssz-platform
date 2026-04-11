export class DeleteSchoolCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
  ) {}
}
