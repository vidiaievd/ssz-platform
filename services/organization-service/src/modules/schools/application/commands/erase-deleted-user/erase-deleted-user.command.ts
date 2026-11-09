/** The account's 30-day deletion grace is over (`auth.user.deleted`, VoxOrd plan 07 step 3c). */
export class EraseDeletedUserCommand {
  constructor(
    public readonly userId: string,
    public readonly email: string | null,
  ) {}
}
