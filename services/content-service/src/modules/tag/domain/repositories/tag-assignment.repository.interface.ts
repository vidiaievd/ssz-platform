import { TagAssignmentEntity } from '../entities/tag-assignment.entity.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';

export const TAG_ASSIGNMENT_REPOSITORY = Symbol('ITagAssignmentRepository');

export interface ITagAssignmentRepository {
  findByEntity(entityType: TaggableEntityType, entityId: string): Promise<TagAssignmentEntity[]>;
  findByTagAndEntity(
    tagId: string,
    entityType: TaggableEntityType,
    entityId: string,
  ): Promise<TagAssignmentEntity | null>;
  save(entity: TagAssignmentEntity): Promise<TagAssignmentEntity>;
  delete(id: string): Promise<void>;
}
