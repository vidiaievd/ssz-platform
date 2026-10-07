import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { FindRecordingsInUseQuery } from '../../application/queries/find-recordings-in-use/find-recordings-in-use.query.js';
import type { FindRecordingsInUseResult } from '../../application/queries/find-recordings-in-use/find-recordings-in-use.handler.js';
import { RecordingsInUseRequestDto } from '../dto/recordings-in-use.dto.js';

/**
 * What media-service asks before it deletes a recording nobody seems to need (plan 71).
 * Service-to-service only: `x-internal-token`, not routed by the gateway.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/attempts/recordings')
export class InternalRecordingsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('in-use')
  @HttpCode(HttpStatus.OK)
  async inUse(@Body() dto: RecordingsInUseRequestDto): Promise<FindRecordingsInUseResult> {
    return this.queryBus.execute(
      new FindRecordingsInUseQuery(dto.assetIds, new Date(dto.liveDraftSince)),
    );
  }
}
