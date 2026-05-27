export class GetSchoolBySlugQuery {
  constructor(
    readonly slug: string,
    readonly actorId: string,
  ) {}
}
