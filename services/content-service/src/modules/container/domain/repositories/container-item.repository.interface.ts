import { ContainerItemEntity } from '../entities/container-item.entity.js';

export const CONTAINER_ITEM_REPOSITORY = Symbol('CONTAINER_ITEM_REPOSITORY');

export interface IContainerItemRepository {
  findById(id: string): Promise<ContainerItemEntity | null>;
  findByVersionId(versionId: string): Promise<ContainerItemEntity[]>;
  save(entity: ContainerItemEntity): Promise<ContainerItemEntity>;
  delete(id: string): Promise<void>;
  getMaxPosition(versionId: string): Promise<number>;
  reorder(versionId: string, items: { id: string; position: number }[]): Promise<void>;
  copyItemsToVersion(sourceVersionId: string, targetVersionId: string): Promise<void>;
}
