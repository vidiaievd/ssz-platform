import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetMyPermissionsQuery } from '../../application/queries/get-my-permissions/get-my-permissions.query.js';
import { UpdateMemberPermissionsCommand } from '../../application/commands/update-member-permissions/update-member-permissions.command.js';
import { MemberPermissionsResponseDto } from '../dto/school.response.dto.js';
import { UpdateMemberPermissionsRequestDto } from '../dto/update-member-permissions.request.dto.js';

@ApiTags('School Members')
@ApiBearerAuth('JWT')
@Controller('schools')
export class SchoolMembersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':schoolId/me/permissions')
  @ApiOperation({
    summary: 'Get own effective capabilities in a school (§R.3)',
    description:
      'OWNER/ADMIN → all capabilities; MANAGER → DB-stored set; TEACHER/STUDENT → empty array.',
  })
  @ApiResponse({ status: 200, type: MemberPermissionsResponseDto })
  @ApiResponse({ status: 404, description: 'School not found' })
  async getMyPermissions(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<MemberPermissionsResponseDto> {
    return this.queryBus.execute(new GetMyPermissionsQuery(user.sub, schoolId));
  }

  @Patch(':schoolId/members/:userId/permissions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace capability set for a MANAGER member (§R.4)',
    description: 'Full replacement — pass the complete desired capability array. OWNER/ADMIN only.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Caller is not OWNER/ADMIN, or target is not MANAGER' })
  @ApiResponse({ status: 404, description: 'School or member not found' })
  async updateMemberPermissions(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberPermissionsRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateMemberPermissionsCommand(user.sub, schoolId, userId, dto.capabilities),
    );
  }
}
