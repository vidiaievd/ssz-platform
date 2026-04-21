import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { GetTagByIdQuery } from './get-tag-by-id.query.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';

@QueryHandler(GetTagByIdQuery)
export class GetTagByIdHandler implements IQueryHandler<GetTagByIdQuery, TagEntity> {
  constructor(@Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository) {}

  async execute(query: GetTagByIdQuery): Promise<TagEntity> {
    const tag = await this.tagRepo.findById(query.tagId);
    if (!tag || tag.deletedAt !== null) throw new NotFoundException(`Tag ${query.tagId} not found`);
    return tag;
  }
}
