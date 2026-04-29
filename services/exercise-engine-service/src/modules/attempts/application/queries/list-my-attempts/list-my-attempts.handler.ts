import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMyAttemptsQuery } from './list-my-attempts.query.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';

export interface ListMyAttemptsResult {
  items: Attempt[];
  nextCursor: string | null;
  limit: number;
}

function encodeCursor(attempt: Attempt): string {
  const payload = JSON.stringify({ startedAt: attempt.startedAt.toISOString(), id: attempt.id });
  return Buffer.from(payload).toString('base64url');
}

function decodeCursor(cursor: string): { startedAt: Date; id: string } {
  const { startedAt, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    startedAt: string;
    id: string;
  };
  return { startedAt: new Date(startedAt), id };
}

@QueryHandler(ListMyAttemptsQuery)
export class ListMyAttemptsHandler implements IQueryHandler<ListMyAttemptsQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
  ) {}

  async execute(query: ListMyAttemptsQuery): Promise<ListMyAttemptsResult> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const { items, hasMore } = await this.attempts.findByUserWithCursor(query.userId, {
      exerciseId: query.exerciseId,
      status: query.status,
      limit: query.limit,
      cursor,
    });

    const nextCursor =
      hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;

    return { items, nextCursor, limit: query.limit };
  }
}

export { encodeCursor, decodeCursor };
