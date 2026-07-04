import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { RelatableEntityType } from '../types/relatable-entity-type.js';
import { RelationKind } from '../types/relation-kind.js';

interface ContentRelationProps {
  sourceType: RelatableEntityType;
  sourceId: string;
  targetType: RelatableEntityType;
  targetId: string;
  relationKind: RelationKind;
  ownerSchoolId: string | null;
  createdAt: Date;
  createdByUserId: string;
}

export class ContentRelationEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: ContentRelationProps,
  ) {
    super(id);
  }

  get sourceType(): RelatableEntityType {
    return this.props.sourceType;
  }
  get sourceId(): string {
    return this.props.sourceId;
  }
  get targetType(): RelatableEntityType {
    return this.props.targetType;
  }
  get targetId(): string {
    return this.props.targetId;
  }
  get relationKind(): RelationKind {
    return this.props.relationKind;
  }
  get ownerSchoolId(): string | null {
    return this.props.ownerSchoolId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  static create(
    props: Omit<ContentRelationProps, 'createdAt'>,
    id?: string,
  ): ContentRelationEntity {
    return new ContentRelationEntity(id ?? randomUUID(), {
      ...props,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ContentRelationProps): ContentRelationEntity {
    return new ContentRelationEntity(id, props);
  }
}
