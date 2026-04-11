export class UpdateProfileCommand {
  constructor(
    readonly userId: string,
    readonly displayName?: string,
    readonly firstName?: string,
    readonly lastName?: string,
    readonly avatarUrl?: string,
    readonly bio?: string,
    readonly timezone?: string,
    readonly locale?: string,
  ) {}
}
