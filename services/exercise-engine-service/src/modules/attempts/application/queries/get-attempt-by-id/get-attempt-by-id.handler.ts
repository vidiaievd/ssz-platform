import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetAttemptByIdQuery } from './get-attempt-by-id.query.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';

export type GetAttemptByIdError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' };

@QueryHandler(GetAttemptByIdQuery)
export class GetAttemptByIdHandler implements IQueryHandler<GetAttemptByIdQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
  ) {}

  async execute(
    query: GetAttemptByIdQuery,
  ): Promise<Result<Attempt, GetAttemptByIdError>> {
    const attempt = await this.attempts.findById(query.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== query.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }
    return Result.ok(attempt);
  }
}
