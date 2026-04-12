export class CreateProfileCommand {
  constructor(
    readonly userId: string,
    readonly displayName: string,
    readonly firstName?: string,
    readonly lastName?: string,
    readonly timezone?: string,
    readonly locale?: string,
  ) {}
}
