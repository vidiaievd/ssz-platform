import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListRelationsByTargetQuery } from './list-relations-by-target.query.js';
import { ContentRelationEntity } from '../../../domain/entities/content-relation.entity.js';
import {
  CONTENT_RELATION_REPOSITORY,
  type IContentRelationRepository,
} from '../../../domain/repositories/content-relation.repository.interface.js';

@QueryHandler(ListRelationsByTargetQuery)
export class ListRelationsByTargetHandler implements IQueryHandler<
  ListRelationsByTargetQuery,
  ContentRelationEntity[]
> {
  constructor(
    @Inject(CONTENT_RELATION_REPOSITORY) private readonly repo: IContentRelationRepository,
  ) {}

  execute(query: ListRelationsByTargetQuery): Promise<ContentRelationEntity[]> {
    return this.repo.findByTarget(query.targetType, query.targetId, query.relationKind);
  }
}
