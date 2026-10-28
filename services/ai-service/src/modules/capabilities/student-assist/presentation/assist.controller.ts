import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { StudentGuard } from '../../../../common/guards/student.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AskAssistantCommand } from '../application/ask-assistant/ask-assistant.command.js';
import type { AskAssistantOutcome } from '../application/ask-assistant/ask-assistant.handler.js';
import { GiveAssistFeedbackCommand } from '../application/give-feedback/give-assist-feedback.command.js';
import type { GiveAssistFeedbackOutcome } from '../application/give-feedback/give-assist-feedback.handler.js';
import type { AssistAccessError } from '../application/assist-payer.resolver.js';
import { GetAssistAvailabilityQuery, type AssistAvailability } from '../application/assist-availability/assist-availability.query.js';
import { AssistRateLimitGuard } from './assist-rate-limit.guard.js';
import {
  AskAssistantDto,
  AssistAnswerDto,
  AssistAvailabilityDto,
  AssistAvailabilityQueryDto,
  AssistFeedbackDto,
  AssistRefusedDto,
  MAX_HISTORY_CHARS,
  toAssistContext,
} from './assist.dto.js';

/**
 * The learner's assistant (plan 83, §3). The phone keeps the thread and sends its last turns
 * (Q1 = A); one JSON answer per turn (Q2 = A). The payer is the server's to settle from the
 * context — the client never names it (R-b).
 */
@ApiTags('Assistant')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not a student, or does not hold the course of the context' })
@UseGuards(StudentGuard)
@Controller('ai/assist')
export class AssistController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('availability')
  @ApiOperation({
    summary: 'Whether the assistant answers here',
    description:
      'The checks a message in this context would pass before any model — who pays, the assistant’s switch, the ' +
      'payer’s policy, plan key and this period’s credits — without calling a model or writing a ledger row. ' +
      '`available: false` without a reason when the check itself could not be made. A message is checked again.',
  })
  @ApiOkResponse({ type: AssistAvailabilityDto })
  @ApiNotFoundResponse({ description: 'No such submission or class of this learner' })
  @ApiUnprocessableEntityResponse({ description: 'The context lacks what its kind needs' })
  async availability(@Query() query: AssistAvailabilityQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<AssistAvailabilityDto> {
    const result: AssistAvailability = await this.queryBus.execute(new GetAssistAvailabilityQuery(user.userId, toAssistContext(query)));
    if (result.kind === 'available') return { available: true };
    if (result.kind === 'unavailable') return result.reason ? { available: false, reason: result.reason } : { available: false };
    throw rejection(result.error);
  }

  @Post('messages')
  @HttpCode(200)
  @UseGuards(AssistRateLimitGuard)
  @ApiOperation({
    summary: 'Ask the assistant',
    description:
      'One turn: the assistant reads what the context lets it (the unit’s published material, the learner’s ' +
      'reviewed work, the class, their mastery profile) and answers in blocks with citations of what it read. ' +
      'It never sees an answer key of work not yet handed in. No answer is ever made up for the client: a ' +
      'refusal is a 409 with its reason, and anything else that leaves no checked answer is a 503 — show ' +
      '«unavailable». Rate-limited per learner (429 with `Retry-After`).',
  })
  @ApiOkResponse({ type: AssistAnswerDto })
  @ApiBadRequestResponse({ description: 'Malformed body, or the history is longer than allowed' })
  @ApiNotFoundResponse({ description: 'No such submission or class of this learner' })
  @ApiConflictResponse({ type: AssistRefusedDto, description: 'Refused for this payer: see `reason`' })
  @ApiUnprocessableEntityResponse({ description: 'The context lacks what its kind needs' })
  @ApiTooManyRequestsResponse({ description: 'Too many messages in the window' })
  @ApiServiceUnavailableResponse({ description: 'No checked answer — every model failed, or the context could not be read' })
  async message(@Body() body: AskAssistantDto, @CurrentUser() user: AuthenticatedUser): Promise<AssistAnswerDto> {
    const historyChars = body.history.reduce((sum, turn) => sum + turn.text.length, 0);
    if (historyChars > MAX_HISTORY_CHARS) {
      throw new BadRequestException(`history must hold at most ${MAX_HISTORY_CHARS} characters together`);
    }

    const outcome: AskAssistantOutcome = await this.commandBus.execute(
      new AskAssistantCommand(
        user.userId,
        toAssistContext(body.context),
        body.history.map((turn) => ({ role: turn.role, text: turn.text })),
        body.message,
      ),
    );
    switch (outcome.kind) {
      case 'answered':
        return { callId: outcome.callId, ...outcome.answer };
      case 'rejected':
        throw rejection(outcome.error);
      case 'refused':
        throw new ConflictException({ statusCode: 409, message: 'The assistant is not available', reason: outcome.reason });
      case 'silent':
        throw new ServiceUnavailableException('The assistant is unavailable');
    }
  }

  @Post('feedback')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Mark an answer helpful or not',
    description:
      'Once per answer, on the `callId` it came with. What is counted is the answering model and prompt, read ' +
      'from the ledger; the reason stays in ai-service and is never sent on.',
  })
  @ApiNoContentResponse({ description: 'Recorded' })
  @ApiBadRequestResponse({ description: 'Malformed body, or the reason is longer than allowed' })
  @ApiNotFoundResponse({ description: 'No answer of the assistant to this learner under that id' })
  @ApiConflictResponse({ description: 'This answer was marked before' })
  async feedback(@Body() body: AssistFeedbackDto, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const outcome: GiveAssistFeedbackOutcome = await this.commandBus.execute(
      new GiveAssistFeedbackCommand(user.userId, body.callId, body.helpful, body.reason ?? null),
    );
    switch (outcome.kind) {
      case 'recorded':
        return;
      case 'not_found':
        throw new NotFoundException('No such answer');
      case 'already_given':
        throw new ConflictException('This answer was marked before');
    }
  }
}

function rejection(error: AssistAccessError): Error {
  switch (error.code) {
    case 'invalid_context':
      return new UnprocessableEntityException(error.message);
    case 'not_found':
      return new NotFoundException('No such submission or class');
    case 'not_enrolled':
      return new ForbiddenException('The course of the context is not the learner’s');
  }
}
