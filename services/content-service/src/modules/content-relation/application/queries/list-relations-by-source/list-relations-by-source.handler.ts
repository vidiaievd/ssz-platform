import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListRelationsBySourceQuery } from './list-relations-by-source.query.js';
import { ContentRelationEntity } from '../../../domain/entities/content-relation.entity.js';
import {
  CONTENT_RELATION_REPOSITORY,
  type IContentRelationRepository,
} from '../../../domain/repositories/content-relation.repository.interface.js';

@QueryHandler(ListRelationsBySourceQuery)
export class ListRelationsBySourceHandler
  implements IQueryHandler<ListRelationsBySourceQuery, ContentRelationEntity[]>
{
  constructor(
    @Inject(CONTENT_RELATION_REPOSITORY) private readonly repo: IContentRelationRepository,
  ) {}

  execute(query: ListRelationsBySourceQuery): Promise<ContentRelationEntity[]> {
    return this.repo.findBySource(query.sourceType, query.sourceId, query.relationKind);
  }
}
