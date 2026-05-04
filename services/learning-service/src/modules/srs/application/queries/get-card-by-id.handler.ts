import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { Result } from '../../../../shared/kernel/result.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
  type SrsApplicationError,
} from '../errors/srs-application.errors.js';
import { GetCardByIdQuery } from './get-card-by-id.query.js';

@QueryHandler(GetCardByIdQuery)
export class GetCardByIdHandler
  implements IQueryHandler<GetCardByIdQuery, Result<ReviewCardDto, SrsApplicationError>>
{
  constructor(@Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository) {}

  async execute(query: GetCardByIdQuery): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const card = await this.repo.findById(query.cardId);
    if (!card) return Result.fail(new SrsCardNotFoundError(query.cardId));
    if (card.userId !== query.userId) return Result.fail(new SrsCardUnauthorizedError());
    return Result.ok(toReviewCardDto(card));
  }
}
