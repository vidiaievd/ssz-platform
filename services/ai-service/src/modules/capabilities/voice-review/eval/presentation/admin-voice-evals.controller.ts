import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import { RunVoiceEvalCommand } from '../application/run-voice-eval.command.js';
import type { ReadingEvalRun } from '../application/voice-eval-runner.js';
import {
  GetVoiceEvalRunQuery,
  ListVoiceEvalRunsQuery,
  voiceBindingMatch,
  type VoiceEvalRuns,
  type VoiceEvalRunSummary,
} from '../application/voice-eval-runs.queries.js';
import { RunVoiceEvalDto, VoiceEvalRunDto, VoiceEvalRunsDto, VoiceEvalRunSummaryDto } from './voice-eval.dto.js';

const DEFAULT_SET_SIZE = 100;

@ApiTags('Admin — voice review evals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai/evals/voice_review')
export class AdminVoiceEvalsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('run')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Measure a speech model on the readings teachers ruled on (gate Q5)',
    description:
      'Hears every take of the newest decided readings aloud (exercise-engine) on the candidate, checks what was heard ' +
      "with the engine's reading check under each exercise's mark, and compares the machine's pass / fail with the " +
      "teacher's, prompt by prompt. Answers at once with the run `running`; read it back by id. The platform pays; " +
      'every call is a ledger row with surface `admin_eval`. No text or audio is stored.',
  })
  @ApiAcceptedResponse({ type: VoiceEvalRunSummaryDto })
  @ApiNotFoundResponse({ description: 'Unknown model' })
  @ApiUnprocessableEntityResponse({
    description: 'Not a speech model, unconfigured, lacking word timings (or pronunciation when asked), or no decided readings',
  })
  @ApiServiceUnavailableResponse({ description: 'exercise-engine could not hand out the set' })
  async run(@Body() body: RunVoiceEvalDto, @CurrentUser() user: AuthenticatedUser): Promise<VoiceEvalRunSummary> {
    const { cases: _cases, ...run }: ReadingEvalRun = await this.commandBus.execute(
      new RunVoiceEvalCommand(body.modelId, body.pronunciation ?? false, body.limit ?? DEFAULT_SET_SIZE, user.userId),
    );
    return { ...run, matchesBinding: voiceBindingMatch(run, run.bindingAtStart) };
  }

  @Get('runs')
  @ApiOperation({
    summary: 'Compare runs',
    description:
      "Runs of `voice_review` and `voice_review_pronunciation` newest first, scores side by side, each marked against its capability's binding today.",
  })
  @ApiOkResponse({ type: VoiceEvalRunsDto })
  list(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number): Promise<VoiceEvalRuns> {
    return this.queryBus.execute(new ListVoiceEvalRunsQuery(Math.min(Math.max(limit, 1), 100)));
  }

  @Get('runs/:runId')
  @ApiOperation({
    summary: 'One run, reading by reading',
    description: "Per prompt: heard or why not, the machine's pass / fail and words-read %, the teacher's verdict. No text.",
  })
  @ApiOkResponse({ type: VoiceEvalRunDto })
  @ApiNotFoundResponse({ description: 'Unknown run' })
  get(@Param('runId', ParseUUIDPipe) runId: string): Promise<VoiceEvalRunDto> {
    return this.queryBus.execute(new GetVoiceEvalRunQuery(runId));
  }
}
