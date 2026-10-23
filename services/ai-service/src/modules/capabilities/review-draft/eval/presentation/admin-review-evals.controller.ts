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
import type { EvalRun } from '../domain/eval-run.js';
import {
  bindingMatch,
  GetReviewEvalRunQuery,
  ListReviewEvalRunsQuery,
  type EvalRunSummary,
  type ReviewEvalRuns,
} from '../application/review-eval-runs.queries.js';
import { RunReviewEvalCommand } from '../application/run-review-eval.command.js';
import { EvalRunDto, EvalRunsDto, EvalRunSummaryDto, RunReviewEvalDto } from './review-eval.dto.js';

const DEFAULT_SET_SIZE = 100;

@ApiTags('Admin — review draft evals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai/evals/review_draft')
export class AdminReviewEvalsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('run')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Measure a candidate model on the teachers’ settled drafts',
    description:
      'Reruns the newest settled drafts (exercise-engine) on the candidate with the given prompt version and the ' +
      "binding's call parameters, and scores its remarks against what the teachers kept and threw out. Answers at " +
      'once with the run `running`; read it back by id. The platform pays; every call is a ledger row with surface ' +
      '`admin_eval`. No text is stored.',
  })
  @ApiAcceptedResponse({ type: EvalRunSummaryDto })
  @ApiNotFoundResponse({ description: 'Unknown model' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown prompt version, model unconfigured or lacking json_mode, or no settled drafts yet',
  })
  @ApiServiceUnavailableResponse({ description: 'exercise-engine could not hand out the set' })
  async run(@Body() body: RunReviewEvalDto, @CurrentUser() user: AuthenticatedUser): Promise<EvalRunSummary> {
    const { cases: _cases, ...run }: EvalRun = await this.commandBus.execute(
      new RunReviewEvalCommand(body.modelId, body.promptVersion ?? null, body.limit ?? DEFAULT_SET_SIZE, user.userId),
    );
    return { ...run, matchesBinding: bindingMatch(run, run.bindingAtStart) };
  }

  @Get('runs')
  @ApiOperation({
    summary: 'Compare runs',
    description: "Runs newest first, scores side by side, each marked against today's binding (primary / fallback / none).",
  })
  @ApiOkResponse({ type: EvalRunsDto })
  list(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number): Promise<ReviewEvalRuns> {
    return this.queryBus.execute(new ListReviewEvalRunsQuery(Math.min(Math.max(limit, 1), 100)));
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'One run, case by case', description: 'Per case: outcome, latency and how each remark was judged. No text.' })
  @ApiOkResponse({ type: EvalRunDto })
  @ApiNotFoundResponse({ description: 'Unknown run' })
  get(@Param('runId', ParseUUIDPipe) runId: string): Promise<EvalRunDto> {
    return this.queryBus.execute(new GetReviewEvalRunQuery(runId));
  }
}
