import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { FindRecordingsInUseQuery } from './find-recordings-in-use.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';

export interface FindRecordingsInUseResult {
  /** The asked ids that some attempt stands on, each once. Ids nobody stands on are left out. */
  inUse: string[];
}

@QueryHandler(FindRecordingsInUseQuery)
export class FindRecordingsInUseHandler implements IQueryHandler<FindRecordingsInUseQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: FindRecordingsInUseQuery): Promise<FindRecordingsInUseResult> {
    const asked = [...new Set(query.assetIds)];
    // An empty question has an empty answer; the database is not asked.
    if (asked.length === 0) return { inUse: [] };

    const held = await this.attempts.findRecordingsInUse(asked, query.liveDraftSince);
    // Only what was asked: the repository is trusted to filter, the contract is kept here.
    const askedSet = new Set(asked);
    return { inUse: [...new Set(held)].filter((id) => askedSet.has(id)) };
  }
}
