import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { toSrsStatsDto, type SrsStatsDto } from '../dto/srs.dto.js';
import { GetUserSrsStatsQuery } from './get-user-srs-stats.query.js';

@QueryHandler(GetUserSrsStatsQuery)
export class GetUserSrsStatsHandler
  implements IQueryHandler<GetUserSrsStatsQuery, SrsStatsDto>
{
  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(query: GetUserSrsStatsQuery): Promise<SrsStatsDto> {
    const stats = await this.repo.getStatsByUser(query.userId, this.clock.now());
    return toSrsStatsDto(stats);
  }
}
