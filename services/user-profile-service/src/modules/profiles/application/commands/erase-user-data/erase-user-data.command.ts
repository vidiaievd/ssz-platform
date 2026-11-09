/** The account is gone from auth for good (`auth.user.deleted`); drop what is kept here about it. */
export class EraseUserDataCommand {
  constructor(readonly userId: string) {}
}
