import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
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
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { AdminReasonDto } from '../../../../common/dto/admin-reason.js';
import { BusinessErrorDto } from '../../../../common/errors/business-error.dto.js';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import type { AdminActor } from '../../../../shared/application/admin-audit.js';
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
@ApiBadRequestResponse({ description: 'Validation failed — e.g. a change without a reason or with a blank one' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin of the route\'s admin level (admin-panel session)' })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
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

  @RequireAdminLevel('super')
  @Post()
  @ApiOperation({ summary: 'Create a plan at version 1' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  @ApiConflictResponse({ description: 'The code is taken' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Bad code, unknown key, bad credits or limits' })
  create(@Body() body: CreatePlanDto, @CurrentAdmin() admin: AdminActor): Promise<PlanView> {
    return this.commandBus.execute(
      new CreatePlanCommand(body.code, body.name, body.audience, toPlanFeatures(body.features), admin, body.reason),
    );
  }

  @RequireAdminLevel('super')
  @Patch(':code')
  @ApiOperation({ summary: 'Rename', description: 'Display name only; does not create a version. The same name again changes nothing' })
  @ApiParam(CODE_PARAM)
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiConflictResponse({ description: 'The plan changed meanwhile' })
  rename(@Param('code') code: string, @Body() body: RenamePlanDto, @CurrentAdmin() admin: AdminActor): Promise<PlanView> {
    return this.commandBus.execute(new RenamePlanCommand(code, body.name, admin, body.reason));
  }

  @RequireAdminLevel('super')
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
    @CurrentAdmin() admin: AdminActor,
  ): Promise<PlanView> {
    return this.commandBus.execute(
      new RevisePlanCommand(code, toPlanFeatures(body.features), body.expectedVersion, admin, body.reason),
    );
  }

  @RequireAdminLevel('super')
  @Post(':code/archive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive', description: 'No new assignments; accounts already on it keep their version' })
  @ApiParam(CODE_PARAM)
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Already archived' })
  archive(@Param('code') code: string, @Body() body: AdminReasonDto, @CurrentAdmin() admin: AdminActor): Promise<PlanView> {
    return this.commandBus.execute(new ArchivePlanCommand(code, admin, body.reason));
  }
}
