export class SeedProfileNameCommand {
  constructor(
    readonly userId: string,
    readonly firstName: string | null,
    readonly lastName: string | null,
  ) {}
}
