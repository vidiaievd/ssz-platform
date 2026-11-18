import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { BusinessErrorDto } from '../../../../common/errors/business-error.dto.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import type { AdminActor } from '../../../../shared/application/admin-audit.js';
import { MigrateSubscribersCommand } from '../../application/commands/migrate-subscribers/migrate-subscribers.command.js';
import type { MigrationBatch, MigrationPreview } from '../../application/commands/migrate-subscribers/migrate-subscribers.handler.js';
import { MigrateSubscribersDto, MigrationBatchDto, MigrationPreviewDto } from '../dto/migration.dto.js';

@ApiTags('Admin — plans')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not a super platform admin (admin-panel session)' })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('super')
@Controller('admin/subscriptions/plans')
export class AdminPlanMigrationController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':code/migrate')
  @HttpCode(200)
  @ApiOperation({
    summary: "Move subscribers of older versions to the plan's current version",
    description:
      'dryRun: true — per source version, how many current subscriptions and what changes key by key. ' +
      'dryRun: false — moves up to 200 accounts per call (each closes its row and opens one on the current ' +
      'version with the same status, start and end, so the credit month goes on), one trail row ' +
      '`subscription.migrated` per account with a shared batchId, and a fresh entitlements snapshot. ' +
      'Grants stay. Call again with the batchId while `remaining > 0`.',
  })
  @ApiParam({ name: 'code', example: 'tutor_pro', description: 'Plan code' })
  @ApiExtraModels(MigrationPreviewDto, MigrationBatchDto)
  @ApiOkResponse({ schema: { oneOf: [{ $ref: getSchemaPath(MigrationPreviewDto) }, { $ref: getSchemaPath(MigrationBatchDto) }] } })
  @ApiBadRequestResponse({ description: 'Validation failed — e.g. a run without a reason' })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiUnprocessableEntityResponse({
    type: BusinessErrorDto,
    description: '`plan_archived`, `migration_target_not_current`, `invalid_source_versions`',
  })
  migrate(
    @Param('code') code: string,
    @Body() body: MigrateSubscribersDto,
    @CurrentAdmin() admin: AdminActor,
  ): Promise<MigrationPreview | MigrationBatch> {
    return this.commandBus.execute(
      new MigrateSubscribersCommand(
        code,
        body.toVersion,
        body.fromVersions ?? null,
        body.dryRun,
        admin,
        body.reason ?? null,
        body.batchId ?? null,
      ),
    );
  }
}
