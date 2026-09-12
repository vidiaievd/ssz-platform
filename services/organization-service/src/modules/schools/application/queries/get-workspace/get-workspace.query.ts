export class GetWorkspaceQuery {
  constructor(
    /** Workspace id, or a school's URL slug. A solo workspace is only ever asked for by id. */
    public readonly idOrSlug: string,
    public readonly actorId: string,
  ) {}
}
