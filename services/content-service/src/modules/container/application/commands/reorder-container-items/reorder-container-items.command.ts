export interface ReorderItem {
  id: string;
  position: number;
}

export class ReorderContainerItemsCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly items: ReorderItem[],
  ) {}
}
