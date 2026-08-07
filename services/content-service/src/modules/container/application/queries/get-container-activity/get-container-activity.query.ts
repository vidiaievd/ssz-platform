export class GetContainerActivityQuery {
  constructor(
    public readonly containerId: string,
    public readonly limit: number,
    /**
     * Keyset cursor: return entries strictly older than this instant. Offsets
     * would skip or repeat entries as new ones land on top of a feed that is
     * being written to while it is read.
     */
    public readonly before?: Date,
  ) {}
}
