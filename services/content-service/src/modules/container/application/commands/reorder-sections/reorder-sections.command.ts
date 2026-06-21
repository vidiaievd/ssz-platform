export interface ReorderSection {
  id: string;
  position: number;
}

export class ReorderSectionsCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly sections: ReorderSection[],
  ) {}
}
