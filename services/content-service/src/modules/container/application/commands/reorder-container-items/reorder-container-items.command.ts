export interface ReorderItem {
  id: string;
  position: number;
  // Omit to keep the item's current section. Pass null to ungroup it, or a
  // section id to move it there — enables cross-section drag-and-drop in a
  // single atomic call alongside the position renumbering.
  sectionId?: string | null;
}

export class ReorderContainerItemsCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly items: ReorderItem[],
  ) {}
}
