export class TransferStudentCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly studentUserId: string,
    public readonly fromGroupId: string,
    public readonly toGroupId: string,
    public readonly role: 'student' | 'trial' | 'observer' = 'student',
    public readonly override: boolean = false,
  ) {}
}
