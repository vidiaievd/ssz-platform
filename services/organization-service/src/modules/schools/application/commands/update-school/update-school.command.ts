export class UpdateSchoolCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly name?: string,
    public readonly slug?: string,
    public readonly description?: string,
    public readonly avatarUrl?: string,
    public readonly website?: string | null,
    public readonly contactEmail?: string | null,
    public readonly city?: string | null,
    public readonly requireTutorReviewForSelfPaced?: boolean,
    public readonly defaultExplanationLanguage?: string | null,
  ) {}
}
