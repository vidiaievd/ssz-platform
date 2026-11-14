import { Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { SweepRunner, type AnySweepReport } from '../../application/sweep-runner.js';
import type { SweepRunMode } from '../../domain/sweep-run.js';

/** `dryRun=false` exactly deletes; anything else — or nothing — is a dry run. */
function modeOf(dryRun: string | undefined): SweepRunMode {
  return dryRun === 'false' ? 'delete' : 'dry-run';
}

/**
 * The operator's manual runs (plans 71, 74, 76), same paths as before; each leaves a row in
 * `sweep_runs` with trigger `operator` (plan 90, phase 8, step 3). Service token only, not routed
 * by the gateway.
 */
@ApiTags('internal')
@ApiHeader({ name: 'x-internal-token', required: true, description: 'Shared service token' })
@ApiResponse({ status: 401, description: 'Missing or wrong x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/media/assets')
export class InternalSweepsController {
  constructor(private readonly runner: SweepRunner) {}

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
  async sweepOrphansNow(@Query('dryRun') dryRun?: string): Promise<AnySweepReport> {
    return this.runner.run('orphan_recordings', { trigger: 'operator', mode: modeOf(dryRun) });
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
  async sweepSupersededNow(@Query('dryRun') dryRun?: string): Promise<AnySweepReport> {
    return this.runner.run('superseded_narrations', { trigger: 'operator', mode: modeOf(dryRun) });
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
  async sweepAbandonedNow(@Query('dryRun') dryRun?: string): Promise<AnySweepReport> {
    return this.runner.run('abandoned_uploads', { trigger: 'operator', mode: modeOf(dryRun) });
  }

  @Post('sweep-orphan-content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the orphan content-asset sweep now (operator)',
    description:
      'Uploaded lesson and exercise assets older than MEDIA_ORPHAN_MIN_AGE_DAYS that nothing in content names ' +
      '(content-service is asked; replaced narrations are left to their own sweep). A DRY RUN unless ' +
      '`dryRun=false` is passed explicitly.',
  })
  @ApiResponse({ status: 200, description: 'ContentSweepReport' })
  async sweepOrphanContentNow(@Query('dryRun') dryRun?: string): Promise<AnySweepReport> {
    return this.runner.run('orphan_content', { trigger: 'operator', mode: modeOf(dryRun) });
  }
}
