import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import { toProgressDto, type ProgressDto } from '../dto/progress.dto.js';
import { GetUserProgressQuery } from './get-user-progress.query.js';

@QueryHandler(GetUserProgressQuery)
export class GetUserProgressHandler implements IQueryHandler<GetUserProgressQuery, ProgressDto[]> {
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly repo: IProgressRepository,
  ) {}

  async execute(query: GetUserProgressQuery): Promise<ProgressDto[]> {
    const records = await this.repo.findByUser(query.userId, {
      contentType: query.contentType,
    });
    return records.map(toProgressDto);
  }
}
