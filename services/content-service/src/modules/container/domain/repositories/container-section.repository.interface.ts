import { ContainerSectionEntity } from '../entities/container-section.entity.js';

export const CONTAINER_SECTION_REPOSITORY = Symbol('CONTAINER_SECTION_REPOSITORY');

export interface IContainerSectionRepository {
  findById(id: string): Promise<ContainerSectionEntity | null>;
  findByVersionId(versionId: string): Promise<ContainerSectionEntity[]>;
  save(entity: ContainerSectionEntity): Promise<ContainerSectionEntity>;
  delete(id: string): Promise<void>;
  getMaxPosition(versionId: string): Promise<number>;
  reorder(versionId: string, sections: { id: string; position: number }[]): Promise<void>;
  /** Sets section_id = null on every item currently pointing at this section. */
  unassignItems(sectionId: string): Promise<void>;
}
