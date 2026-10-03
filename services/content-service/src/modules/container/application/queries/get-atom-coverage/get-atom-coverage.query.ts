/** Which composition to read. The same two scopes the skill coverage report uses. */
export type AtomCoverageVersionScope = 'draft' | 'published';

export class GetAtomCoverageQuery {
  constructor(
    public readonly containerId: string,
    public readonly version: AtomCoverageVersionScope = 'draft',
  ) {}
}
