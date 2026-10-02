/**
 * Sets or clears this course's own recipe.
 *
 * `null` means "inherit the workspace's" — a value, not an omission. `recipe` is
 * untrusted; the entity validates it.
 */
export class SetContainerCoverageRecipeCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly recipe: unknown,
  ) {}
}
