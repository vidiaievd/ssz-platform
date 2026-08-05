import { ContainerItemEntity } from '../entities/container-item.entity.js';

export const CONTAINER_ITEM_REPOSITORY = Symbol('CONTAINER_ITEM_REPOSITORY');

export interface IContainerItemRepository {
  findById(id: string): Promise<ContainerItemEntity | null>;
  findByVersionId(versionId: string): Promise<ContainerItemEntity[]>;
  save(entity: ContainerItemEntity): Promise<ContainerItemEntity>;
  delete(id: string): Promise<void>;
  getMaxPosition(versionId: string): Promise<number>;
  reorder(
    versionId: string,
    items: { id: string; position: number; sectionId?: string | null }[],
  ): Promise<void>;
  /**
   * Clones a version's whole composition — its sections *and* its items, with
   * every item repointed at the cloned section. Named for the composition
   * rather than the items because copying one without the other leaves the
   * target ungrouped.
   */
  copyCompositionToVersion(sourceVersionId: string, targetVersionId: string): Promise<void>;
}
