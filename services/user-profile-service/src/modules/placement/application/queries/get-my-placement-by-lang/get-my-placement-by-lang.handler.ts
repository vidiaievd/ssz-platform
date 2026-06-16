import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PlacementNotFoundException } from '../../../domain/exceptions/placement-not-found.exception.js';
import { PLACEMENT_RESULT_REPOSITORY } from '../../../domain/repositories/placement-result.repository.interface.js';
import type { IPlacementResultRepository } from '../../../domain/repositories/placement-result.repository.interface.js';
import type { PlacementResultDto } from '../../dto/placement-result.dto.js';
import { GetMyPlacementByLangQuery } from './get-my-placement-by-lang.query.js';

@QueryHandler(GetMyPlacementByLangQuery)
export class GetMyPlacementByLangHandler implements IQueryHandler<GetMyPlacementByLangQuery, PlacementResultDto> {
  constructor(
    @Inject(PLACEMENT_RESULT_REPOSITORY)
    private readonly repo: IPlacementResultRepository,
  ) {}

  async execute(query: GetMyPlacementByLangQuery): Promise<PlacementResultDto> {
    const result = await this.repo.findLatestPlatformByUserAndLang(query.userId, query.language);
    if (!result) {
      throw new PlacementNotFoundException(query.userId, query.language);
    }
    return {
      id: result.id,
      userId: result.userId,
      language: result.language,
      cefrLevel: result.cefrLevel,
      score: result.score,
      scope: result.scope,
      membershipId: result.membershipId,
      sourceLabel: result.sourceLabel,
      takenAt: result.takenAt,
      createdAt: result.createdAt,
    };
  }
}
