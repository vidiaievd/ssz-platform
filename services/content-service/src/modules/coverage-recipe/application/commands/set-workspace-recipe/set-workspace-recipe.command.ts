/** Replaces a workspace's recipe. `recipe` is untrusted; the entity validates it. */
export class SetWorkspaceRecipeCommand {
  constructor(
    public readonly userId: string,
    public readonly schoolId: string,
    public readonly recipe: unknown,
  ) {}
}
