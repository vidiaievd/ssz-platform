import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { DescribeAssetsQuery, type AssetDescription } from '../../application/queries/describe-assets/describe-assets.query.js';
import { GetPlaybackQuery, type AssetPlayback } from '../../application/queries/get-playback/get-playback.query.js';
import {
  SweepOrphanRecordingsService,
  type SweepReport,
} from '../../application/services/sweep-orphan-recordings.service.js';
import {
  SweepSupersededNarrationsService,
  type SupersededSweepReport,
} from '../../application/services/sweep-superseded-narrations.service.js';
import {
  SweepAbandonedUploadsService,
  type AbandonedUploadSweepReport,
} from '../../application/services/sweep-abandoned-uploads.service.js';
import {
  SweepOrphanContentAssetsService,
  type ContentSweepReport,
} from '../../application/services/sweep-orphan-content-assets.service.js';
import {
  SupersedeAssetCommand,
  type SupersedeAssetResult,
} from '../../application/commands/supersede-asset/supersede-asset.command.js';
import { SupersedeAssetDto, SupersedeAssetResponseDto } from '../dto/asset-response.dto.js';
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
    private readonly commandBus: CommandBus,
    private readonly sweepOrphans: SweepOrphanRecordingsService,
    private readonly sweepSuperseded: SweepSupersededNarrationsService,
    private readonly sweepAbandoned: SweepAbandonedUploadsService,
    private readonly sweepContent: SweepOrphanContentAssetsService,
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

  @Post(':assetId/supersede')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a lesson asset as replaced by another (content-service)',
    description:
      'The batch narration (plan 74, phase 4) calls this after it has pointed a lesson body at a ' +
      'new narration. Same effect as the author-facing route: nothing is deleted, the old asset ' +
      'stays restorable until `restorableUntil`.',
  })
  @ApiResponse({ status: 200, type: SupersedeAssetResponseDto })
  @ApiResponse({ status: 404, description: 'Asset or replacement not found' })
  @ApiResponse({ status: 422, description: 'Not a lesson asset, or replaced by itself' })
  async supersede(
    @Param('assetId') assetId: string,
    @Body() dto: SupersedeAssetDto,
  ): Promise<SupersedeAssetResponseDto> {
    const result: SupersedeAssetResult = await this.commandBus.execute(new SupersedeAssetCommand(assetId, dto.by));
    if (result.isFail) {
      if (result.error === 'ASSET_NOT_FOUND' || result.error === 'REPLACEMENT_NOT_FOUND') {
        throw new NotFoundException(result.error);
      }
      throw new UnprocessableEntityException(result.error);
    }
    return result.value;
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

  @Post('sweep-superseded')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the replaced-narration sweep now (operator)',
    description:
      'Lesson assets replaced more than NARRATION_RETENTION_DAYS ago that no lesson body names ' +
      '(content-service is asked). A DRY RUN unless `dryRun=false` is passed explicitly.',
  })
  @ApiResponse({ status: 200, description: 'SupersededSweepReport' })
  async sweepSupersededNow(@Query('dryRun') dryRun?: string): Promise<SupersededSweepReport> {
    return this.sweepSuperseded.run({ mode: dryRun === 'false' ? 'delete' : 'dry-run' });
  }

  @Post('sweep-abandoned-uploads')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the abandoned-upload sweep now (operator)',
    description:
      'Assets still PENDING_UPLOAD after MEDIA_ORPHAN_MIN_AGE_DAYS — an upload asked for and never ' +
      'finished. A DRY RUN unless `dryRun=false` is passed explicitly.',
  })
  @ApiResponse({ status: 200, description: 'AbandonedUploadSweepReport' })
  async sweepAbandonedNow(@Query('dryRun') dryRun?: string): Promise<AbandonedUploadSweepReport> {
    return this.sweepAbandoned.run({ mode: dryRun === 'false' ? 'delete' : 'dry-run' });
  }

  @Post('sweep-orphan-content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the orphan content-asset sweep now (operator)',
    description:
      'Uploaded lesson assets older than MEDIA_ORPHAN_MIN_AGE_DAYS that nothing in content names ' +
      '(content-service is asked; replaced narrations are left to their own sweep). A DRY RUN unless ' +
      '`dryRun=false` is passed explicitly.',
  })
  @ApiResponse({ status: 200, description: 'ContentSweepReport' })
  async sweepOrphanContentNow(@Query('dryRun') dryRun?: string): Promise<ContentSweepReport> {
    return this.sweepContent.run({ mode: dryRun === 'false' ? 'delete' : 'dry-run' });
  }
}
