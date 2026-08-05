import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetCardStatesQuery } from './get-card-states.query.js';
import {
  SRS_REPOSITORY,
  type ISrsRepository,
} from '../../domain/repositories/srs-repository.interface.js';
import { toSrsCardStateDto, type CardStatesEnvelope } from '../dto/srs.dto.js';

@QueryHandler(GetCardStatesQuery)
export class GetCardStatesHandler implements IQueryHandler<GetCardStatesQuery, CardStatesEnvelope> {
  constructor(@Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository) {}

  async execute(query: GetCardStatesQuery): Promise<CardStatesEnvelope> {
    // Duplicates in the request would only widen the IN clause; the response is
    // keyed by contentId anyway, so collapse them before hitting the database.
    const contentIds = [...new Set(query.contentIds)];
    if (contentIds.length === 0) return { states: [] };

    // The repository scopes by userId, so another learner's cards can never be
    // reached even if the caller guesses valid content ids.
    const cards = await this.srsRepo.findByUserAndContents(
      query.userId,
      query.contentType,
      contentIds,
    );

    // Content ids without a card are omitted — the client treats them as NEW.
    return { states: cards.map(toSrsCardStateDto) };
  }
}
