import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { RecordLookupsCommand } from '../application/commands/record-lookups.command.js';
import { RecordLookupsRequest } from './dto/record-lookups.request.js';

@ApiTags('lookups')
@ApiBearerAuth()
@Controller('lookups')
export class LookupsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Record word-card lookups made while reading',
    description:
      'Behavioural telemetry from the reader: which glossed words a learner opened, and how ' +
      'far. Stores nothing — each lookup is published as learning.vocabulary.looked_up. The ' +
      "learner's SRS state is resolved here from their own cards and is not accepted from the " +
      'client. Answers 202 with no body; callers must not wait on the outcome.',
  })
  @ApiResponse({ status: 202, description: 'Lookups accepted for publication' })
  @ApiResponse({ status: 400, description: 'Malformed batch, or more than 50 lookups' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async record(
    @Body() dto: RecordLookupsRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.commandBus.execute(new RecordLookupsCommand(user.userId, dto.lookups));
  }
}
