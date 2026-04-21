import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';

export class AddContainerItemCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly itemType: ContainerItemType,
    public readonly itemId: string,
    public readonly isRequired?: boolean,
    public readonly sectionLabel?: string,
    public readonly position?: number,
  ) {}
}
