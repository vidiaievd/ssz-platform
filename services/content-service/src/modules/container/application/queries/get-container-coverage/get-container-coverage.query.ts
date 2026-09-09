/** Which composition to count. `both` also answers whether the two disagree. */
export type CoverageVersionScope = 'draft' | 'published' | 'both';

export class GetContainerCoverageQuery {
  constructor(
    public readonly containerId: string,
    public readonly version: CoverageVersionScope = 'draft',
  ) {}
}
