import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListUserAttemptsQuery } from './list-user-attempts.query.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';

export interface ListUserAttemptsResult {
  items: Attempt[];
  total: number;
  limit: number;
  offset: number;
}

@QueryHandler(ListUserAttemptsQuery)
export class ListUserAttemptsHandler implements IQueryHandler<ListUserAttemptsQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
  ) {}

  async execute(query: ListUserAttemptsQuery): Promise<ListUserAttemptsResult> {
    const { items, total } = await this.attempts.findAllByUser(query.userId, {
      exerciseId: query.exerciseId,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return { items, total, limit: query.limit, offset: query.offset };
  }
}
