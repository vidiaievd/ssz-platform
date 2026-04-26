import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import { toProgressDto, type ProgressDto } from '../dto/progress.dto.js';
import { GetContentProgressQuery } from './get-content-progress.query.js';

@QueryHandler(GetContentProgressQuery)
export class GetContentProgressHandler
  implements IQueryHandler<GetContentProgressQuery, ProgressDto | null>
{
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly repo: IProgressRepository,
  ) {}

  async execute(query: GetContentProgressQuery): Promise<ProgressDto | null> {
    const progress = await this.repo.findByUserAndContent(
      query.userId,
      query.contentType,
      query.contentId,
    );
    return progress ? toProgressDto(progress) : null;
  }
}
