import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';

interface TagAssignmentProps {
  tagId: string;
  entityType: TaggableEntityType;
  entityId: string;
  assignedAt: Date;
  assignedByUserId: string;
}

export class TagAssignmentEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: TagAssignmentProps,
  ) {
    super(id);
  }

  get tagId(): string {
    return this.props.tagId;
  }
  get entityType(): TaggableEntityType {
    return this.props.entityType;
  }
  get entityId(): string {
    return this.props.entityId;
  }
  get assignedAt(): Date {
    return this.props.assignedAt;
  }
  get assignedByUserId(): string {
    return this.props.assignedByUserId;
  }

  static create(props: Omit<TagAssignmentProps, 'assignedAt'>, id?: string): TagAssignmentEntity {
    return new TagAssignmentEntity(id ?? randomUUID(), {
      ...props,
      assignedAt: new Date(),
    });
  }

  static reconstitute(id: string, props: TagAssignmentProps): TagAssignmentEntity {
    return new TagAssignmentEntity(id, props);
  }
}
