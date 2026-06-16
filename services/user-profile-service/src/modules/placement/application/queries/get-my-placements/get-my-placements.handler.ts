import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PLACEMENT_RESULT_REPOSITORY } from '../../../domain/repositories/placement-result.repository.interface.js';
import type { IPlacementResultRepository } from '../../../domain/repositories/placement-result.repository.interface.js';
import type { PlacementResultDto } from '../../dto/placement-result.dto.js';
import { GetMyPlacementsQuery } from './get-my-placements.query.js';

@QueryHandler(GetMyPlacementsQuery)
export class GetMyPlacementsHandler implements IQueryHandler<GetMyPlacementsQuery, PlacementResultDto[]> {
  constructor(
    @Inject(PLACEMENT_RESULT_REPOSITORY)
    private readonly repo: IPlacementResultRepository,
  ) {}

  async execute(query: GetMyPlacementsQuery): Promise<PlacementResultDto[]> {
    const results = await this.repo.findAllByUserId(query.userId);
    return results.map((r) => ({
      id: r.id,
      userId: r.userId,
      language: r.language,
      cefrLevel: r.cefrLevel,
      score: r.score,
      scope: r.scope,
      membershipId: r.membershipId,
      sourceLabel: r.sourceLabel,
      takenAt: r.takenAt,
      createdAt: r.createdAt,
    }));
  }
}
