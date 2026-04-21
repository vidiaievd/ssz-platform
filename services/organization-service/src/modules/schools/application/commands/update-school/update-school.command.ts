export class UpdateSchoolCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly name?: string,
    public readonly description?: string,
    public readonly avatarUrl?: string,
    public readonly requireTutorReviewForSelfPaced?: boolean,
    public readonly defaultExplanationLanguage?: string | null,
  ) {}
}
