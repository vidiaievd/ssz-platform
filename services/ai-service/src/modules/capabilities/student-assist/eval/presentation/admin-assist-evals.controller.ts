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
import { bindingMatch } from '../../../review-draft/eval/application/review-eval-runs.queries.js';
import type { AssistEvalRun } from '../application/assist-eval-runner.js';
import {
  GetAssistEvalRunQuery,
  ListAssistEvalRunsQuery,
  type AssistEvalRuns,
  type AssistEvalRunSummary,
} from '../application/assist-eval-runs.queries.js';
import { RunAssistEvalCommand } from '../application/run-assist-eval.command.js';
import { AssistEvalRunDto, AssistEvalRunsDto, AssistEvalRunSummaryDto, RunAssistEvalDto } from './assist-eval.dto.js';

@ApiTags('Admin — student assistant evals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai/evals/student_assist')
export class AdminAssistEvalsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('run')
  @HttpCode(202)
  @ApiOperation({
    summary: "Measure a candidate model on the assistant's hand-written set",
    description:
      'Asks every question of the set (`assist-eval-set.ts`, over the seeded A2 course) through the assistant\'s own ' +
      "loop — tools, verifier, repair round, tool budget — on the candidate with the given prompt version and the binding's " +
      'call parameters, and scores citations, answer-key leaks, off-topic restraint and verifier rejections. Answers at ' +
      'once with the run `running`; read it back by id. The platform pays; every call is a ledger row with surface ' +
      '`admin_eval`. No text is stored.',
  })
  @ApiAcceptedResponse({ type: AssistEvalRunSummaryDto })
  @ApiNotFoundResponse({ description: 'Unknown model' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown prompt version, model unconfigured or lacking tools / json_mode, or none of the set’s material on this stand',
  })
  @ApiServiceUnavailableResponse({ description: "content-service could not answer for the set's material" })
  async run(@Body() body: RunAssistEvalDto, @CurrentUser() user: AuthenticatedUser): Promise<AssistEvalRunSummary> {
    const { cases: _cases, ...run }: AssistEvalRun = await this.commandBus.execute(
      new RunAssistEvalCommand(body.modelId, body.promptVersion ?? null, user.userId),
    );
    return { ...run, matchesBinding: bindingMatch(run, run.bindingAtStart) };
  }

  @Get('runs')
  @ApiOperation({
    summary: 'Compare runs',
    description: "Runs newest first, scores side by side, each marked against today's binding (primary / fallback / none).",
  })
  @ApiOkResponse({ type: AssistEvalRunsDto })
  list(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number): Promise<AssistEvalRuns> {
    return this.queryBus.execute(new ListAssistEvalRunsQuery(Math.min(Math.max(limit, 1), 100)));
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'One run, case by case', description: 'Per case key: outcome, rounds, rejections, citations and verdicts. No text.' })
  @ApiOkResponse({ type: AssistEvalRunDto })
  @ApiNotFoundResponse({ description: 'Unknown run' })
  get(@Param('runId', ParseUUIDPipe) runId: string): Promise<AssistEvalRunDto> {
    return this.queryBus.execute(new GetAssistEvalRunQuery(runId));
  }
}
