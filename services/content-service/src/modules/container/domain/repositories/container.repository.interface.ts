import { ContainerEntity } from '../entities/container.entity.js';
import { PaginatedResult, ContainerFilter } from '../../../../shared/kernel/pagination.js';

export const CONTAINER_REPOSITORY = Symbol('CONTAINER_REPOSITORY');

export interface IContainerRepository {
  findById(id: string): Promise<ContainerEntity | null>;
  findBySlug(slug: string): Promise<ContainerEntity | null>;
  findAll(filter: ContainerFilter): Promise<PaginatedResult<ContainerEntity>>;
  save(entity: ContainerEntity): Promise<ContainerEntity>;
  softDelete(id: string): Promise<void>;
}
