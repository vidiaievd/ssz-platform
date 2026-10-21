import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { BusinessErrorDto } from '../../../../common/errors/business-error.dto.js';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { ArchivePlanCommand } from '../../application/commands/archive-plan/archive-plan.command.js';
import { CreatePlanCommand } from '../../application/commands/create-plan/create-plan.command.js';
import { RenamePlanCommand } from '../../application/commands/rename-plan/rename-plan.command.js';
import { RevisePlanCommand } from '../../application/commands/revise-plan/revise-plan.command.js';
import type { PlanDetailsView, PlanView } from '../../application/plan-view.js';
import { GetPlanQuery } from '../../application/queries/get-plan/get-plan.query.js';
import { ListPlansQuery } from '../../application/queries/list-plans/list-plans.query.js';
import {
  CreatePlanDto,
  PlanDetailsResponseDto,
  PlanResponseDto,
  RenamePlanDto,
  RevisePlanDto,
  toPlanFeatures,
} from '../dto/plan.dto.js';

const CODE_PARAM = { name: 'code', example: 'tutor_pro', description: 'Plan code' };

@ApiTags('Admin — plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/subscriptions/plans')
export class AdminPlansController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every plan with its current version, archived ones included' })
  @ApiOkResponse({ type: [PlanResponseDto] })
  list(): Promise<PlanView[]> {
    return this.queryBus.execute(new ListPlansQuery());
  }

  @Get(':code')
  @ApiOperation({ summary: 'One plan with all its versions' })
  @ApiParam(CODE_PARAM)
  @ApiOkResponse({ type: PlanDetailsResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  get(@Param('code') code: string): Promise<PlanDetailsView> {
    return this.queryBus.execute(new GetPlanQuery(code));
  }

  @Post()
  @ApiOperation({ summary: 'Create a plan at version 1' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  @ApiConflictResponse({ description: 'The code is taken' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Bad code, unknown key, bad credits or limits' })
  create(@Body() body: CreatePlanDto, @CurrentUser() user: AuthenticatedUser): Promise<PlanView> {
    return this.commandBus.execute(
      new CreatePlanCommand(body.code, body.name, body.audience, toPlanFeatures(body.features), user.userId),
    );
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Rename', description: 'Display name only; does not create a version' })
  @ApiParam(CODE_PARAM)
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiConflictResponse({ description: 'The plan changed meanwhile' })
  rename(@Param('code') code: string, @Body() body: RenamePlanDto): Promise<PlanView> {
    return this.commandBus.execute(new RenamePlanCommand(code, body.name));
  }

  @Post(':code/versions')
  @ApiOperation({
    summary: 'Revise: new feature list = new version',
    description:
      'New subscriptions get the new version. Accounts already on the plan stay on their version until ' +
      'the plan is assigned to them again.',
  })
  @ApiParam(CODE_PARAM)
  @ApiCreatedResponse({ type: PlanResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiConflictResponse({ description: 'expectedVersion is stale' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Archived plan, unknown key, bad credits or limits' })
  revise(
    @Param('code') code: string,
    @Body() body: RevisePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlanView> {
    return this.commandBus.execute(
      new RevisePlanCommand(code, toPlanFeatures(body.features), body.expectedVersion, user.userId),
    );
  }

  @Post(':code/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive', description: 'No new assignments; accounts already on it keep their version' })
  @ApiParam(CODE_PARAM)
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Already archived' })
  archive(@Param('code') code: string): Promise<PlanView> {
    return this.commandBus.execute(new ArchivePlanCommand(code));
  }
}
