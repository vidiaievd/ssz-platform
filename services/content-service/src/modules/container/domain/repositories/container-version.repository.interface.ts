import { ContainerVersionEntity } from '../entities/container-version.entity.js';

export const CONTAINER_VERSION_REPOSITORY = Symbol('CONTAINER_VERSION_REPOSITORY');

export interface IContainerVersionRepository {
  findById(id: string): Promise<ContainerVersionEntity | null>;
  findByContainerId(containerId: string): Promise<ContainerVersionEntity[]>;
  findDraftByContainerId(containerId: string): Promise<ContainerVersionEntity | null>;
  findPublishedByContainerId(containerId: string): Promise<ContainerVersionEntity | null>;
  save(entity: ContainerVersionEntity): Promise<ContainerVersionEntity>;
  delete(id: string): Promise<void>;
  /**
   * Atomic publish transaction:
   * 1. Deprecate previousVersionId (if provided) with sunsetAt = NOW() + sunsetDays.
   * 2. Set versionId status to published.
   * 3. Update containers.current_published_version_id.
   * Returns { sunsetAt } for the deprecated version (if any) so events can be emitted.
   */
  publishVersion(params: {
    versionId: string;
    containerId: string;
    previousVersionId: string | null;
    sunsetDays: number;
    publishedByUserId: string;
  }): Promise<{ sunsetAt: Date | null }>;
}
