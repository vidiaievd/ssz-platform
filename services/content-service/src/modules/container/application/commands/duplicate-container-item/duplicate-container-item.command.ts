export class DuplicateContainerItemCommand {
  constructor(
    public readonly userId: string,
    /** The container the route names — the one the access guard checked. */
    public readonly containerId: string,
    public readonly versionId: string,
    /** `container_items.id` of the row to duplicate. */
    public readonly rowId: string,
  ) {}
}
