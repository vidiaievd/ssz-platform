import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetContainerTagsQuery } from './get-container-tags.query.js';
import {
  CONTAINER_TAG_READER,
  type ContainerTag,
  type IContainerTagReader,
} from '../../ports/container-tag-reader.port.js';

/**
 * The tags of the containers a response is about to return. Asked after the containers are
 * read, so it sees only ids the caller was already allowed to see.
 */
@QueryHandler(GetContainerTagsQuery)
export class GetContainerTagsHandler implements IQueryHandler<
  GetContainerTagsQuery,
  Map<string, ContainerTag[]>
> {
  constructor(@Inject(CONTAINER_TAG_READER) private readonly reader: IContainerTagReader) {}

  execute(query: GetContainerTagsQuery): Promise<Map<string, ContainerTag[]>> {
    return this.reader.forContainers(query.containerIds);
  }
}
