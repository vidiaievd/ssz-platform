import { Body, Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { DescribeAssetsQuery, type AssetDescription } from '../../application/queries/describe-assets/describe-assets.query.js';
import { GetPlaybackQuery, type AssetPlayback } from '../../application/queries/get-playback/get-playback.query.js';
import {
  SweepOrphanRecordingsService,
  type SweepReport,
} from '../../application/services/sweep-orphan-recordings.service.js';
import { AssetDescriptionDto, AssetIdsDto, AssetPlaybackDto } from '../dto/internal-assets.dto.js';

// Service-to-service routes only — @Public() exempts them from the global JWT guard,
// InternalAuthGuard demands 'x-internal-token' instead. Not routed by the gateway:
// nginx has no location for /api/v1/internal/media.
@ApiTags('internal')
@ApiHeader({ name: 'x-internal-token', required: true, description: 'Shared service token' })
@ApiResponse({ status: 401, description: 'Missing or wrong x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/media/assets')
export class InternalAssetsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly sweepOrphans: SweepOrphanRecordingsService,
  ) {}

  @Post('describe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Describe assets (engine)',
    description:
      'Owner, entity, status and measured duration of each asset — what the exercise engine checks ' +
      'before it accepts a read_aloud submission. Unknown ids are left out.',
  })
  @ApiResponse({ status: 200, type: [AssetDescriptionDto] })
  @ApiResponse({ status: 400, description: 'ids missing, empty, too many or not UUIDs' })
  async describe(@Body() dto: AssetIdsDto): Promise<AssetDescription[]> {
    return this.queryBus.execute(new DescribeAssetsQuery(dto.ids));
  }

  @Post('playback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Playback URLs for assets (review BFF)',
    description:
      'Pre-signed URLs with duration and waveform peaks, for a reviewer listening to a submission. ' +
      'The caller must have had the engine confirm the submission is the reviewer\'s to review. ' +
      'Assets not in storage (pending, refused, deleted) and unknown ids are left out.',
  })
  @ApiResponse({ status: 200, type: [AssetPlaybackDto] })
  @ApiResponse({ status: 400, description: 'ids missing, empty, too many or not UUIDs' })
  async playback(@Body() dto: AssetIdsDto): Promise<AssetPlayback[]> {
    return this.queryBus.execute(new GetPlaybackQuery(dto.ids));
  }

  @Post('sweep-orphans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the orphan-recording sweep now (operator)',
    description:
      'Recordings no attempt stands on, older than MEDIA_ORPHAN_MIN_AGE_DAYS. A DRY RUN unless ' +
      '`dryRun=false` is passed explicitly — the configured mode applies only to the nightly run. ' +
      'Answers with what was scanned, held, found and deleted.',
  })
  @ApiResponse({ status: 200, description: 'SweepReport' })
  async sweepOrphansNow(@Query('dryRun') dryRun?: string): Promise<SweepReport> {
    return this.sweepOrphans.run({ mode: dryRun === 'false' ? 'delete' : 'dry-run' });
  }
}
