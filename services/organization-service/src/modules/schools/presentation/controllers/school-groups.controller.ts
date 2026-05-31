import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateSchoolGroupCommand } from '../../application/commands/create-school-group/create-school-group.command.js';
import { UpdateSchoolGroupCommand } from '../../application/commands/update-school-group/update-school-group.command.js';
import { DeleteSchoolGroupCommand } from '../../application/commands/delete-school-group/delete-school-group.command.js';
import { AddGroupMemberCommand } from '../../application/commands/add-group-member/add-group-member.command.js';
import { RemoveGroupMemberCommand } from '../../application/commands/remove-group-member/remove-group-member.command.js';
import { GetSchoolGroupQuery } from '../../application/queries/get-school-group/get-school-group.query.js';
import { ListSchoolGroupsQuery } from '../../application/queries/list-school-groups/list-school-groups.query.js';
import type { SchoolGroup } from '../../domain/entities/school-group.entity.js';
import {
  CreateSchoolGroupRequestDto,
  UpdateSchoolGroupRequestDto,
  AddGroupMemberRequestDto,
} from '../dto/school-group.request.dto.js';
import {
  SchoolGroupResponseDto,
  SchoolGroupSummaryResponseDto,
} from '../dto/school-group.response.dto.js';

@ApiTags('School Groups')
@ApiBearerAuth('JWT')
@Controller('schools/:schoolId/groups')
export class SchoolGroupsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a group within a school (owner/admin only)' })
  @ApiCreatedResponse({ schema: { properties: { id: { type: 'string' } } } })
  @ApiResponse({ status: 403, description: 'Requires OWNER or ADMIN role in the school' })
  async createGroup(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateSchoolGroupRequestDto,
  ): Promise<{ id: string }> {
    return this.commandBus.execute(
      new CreateSchoolGroupCommand(user.sub, schoolId, dto.name, dto.description),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List groups in a school (any school member)' })
  @ApiOkResponse({ type: [SchoolGroupSummaryResponseDto] })
  async listGroups(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolGroupSummaryResponseDto[]> {
    const groups: SchoolGroup[] = await this.queryBus.execute(
      new ListSchoolGroupsQuery(user.sub, schoolId),
    );
    return groups.map(SchoolGroupSummaryResponseDto.fromDomain);
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Get group details with members (any school member)' })
  @ApiOkResponse({ type: SchoolGroupResponseDto })
  async getGroup(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<SchoolGroupResponseDto> {
    const group: SchoolGroup = await this.queryBus.execute(
      new GetSchoolGroupQuery(user.sub, schoolId, groupId),
    );
    return SchoolGroupResponseDto.fromDomain(group);
  }

  @Patch(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update group name/description (owner/admin only)' })
  @ApiNoContentResponse()
  async updateGroup(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateSchoolGroupRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateSchoolGroupCommand(user.sub, schoolId, groupId, dto.name, dto.description),
    );
  }

  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a group (owner/admin only)' })
  @ApiNoContentResponse()
  async deleteGroup(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteSchoolGroupCommand(user.sub, schoolId, groupId),
    );
  }

  @Post(':groupId/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a school member to this group (owner/admin/teacher)' })
  @ApiNoContentResponse()
  async addMember(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddGroupMemberCommand(user.sub, schoolId, groupId, dto.userId),
    );
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from this group (owner/admin/teacher or self)' })
  @ApiNoContentResponse()
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveGroupMemberCommand(user.sub, schoolId, groupId, userId),
    );
  }
}
