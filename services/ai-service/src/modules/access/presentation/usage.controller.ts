import { Controller, Get, NotFoundException, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { StudentGuard } from '../../../common/guards/student.guard.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import type { MyUsage } from '../application/queries/get-my-usage/get-my-usage.handler.js';
import { GetMyUsageQuery } from '../application/queries/get-my-usage/get-my-usage.query.js';
import { MyUsageDto, UsageQueryDto } from './usage.dto.js';

/** The learner's own AI credits (plan 83, step 6) — VoxOrd «Today» and Profile ▸ Subscription. */
@ApiTags('Usage')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not a student' })
@UseGuards(StudentGuard)
@Controller('ai/usage')
export class UsageController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('me')
  @ApiOperation({
    summary: 'Credits of my own plan this period',
    description:
      'What the learner’s own plan has spent on one agent and what it allows. Only the learner’s own account: ' +
      'work a school pays for is not counted here. `total: null` = unmetered.',
  })
  @ApiOkResponse({ type: MyUsageDto })
  @ApiBadRequestResponse({ description: 'Unknown feature' })
  @ApiNotFoundResponse({ description: 'The learner’s plan does not carry this feature' })
  @ApiServiceUnavailableResponse({ description: 'The plan or the ledger could not be read' })
  async me(@Query() query: UsageQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<MyUsageDto> {
    const result: MyUsage = await this.queryBus.execute(new GetMyUsageQuery(user.userId, query.feature));
    switch (result.kind) {
      case 'usage':
        return {
          feature: result.usage.featureKey,
          used: result.usage.used,
          total: result.usage.total,
          periodEnd: result.usage.periodEnd.toISOString(),
        };
      case 'not_entitled':
        throw new NotFoundException('The plan does not carry this feature');
      case 'unavailable':
        throw new ServiceUnavailableException('Usage is unavailable');
    }
  }
}
