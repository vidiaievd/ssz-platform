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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateSchoolCommand } from '../../application/commands/create-school/create-school.command.js';
import { UpdateSchoolCommand } from '../../application/commands/update-school/update-school.command.js';
import { DeleteSchoolCommand } from '../../application/commands/delete-school/delete-school.command.js';
import { AddMemberCommand } from '../../application/commands/add-member/add-member.command.js';
import { RemoveMemberCommand } from '../../application/commands/remove-member/remove-member.command.js';
import { GetSchoolQuery } from '../../application/queries/get-school/get-school.query.js';
import { ListMySchoolsQuery } from '../../application/queries/list-my-schools/list-my-schools.query.js';
import { CreateSchoolRequestDto } from '../dto/create-school.request.dto.js';
import { UpdateSchoolRequestDto } from '../dto/update-school.request.dto.js';
import { AddMemberRequestDto } from '../dto/add-member.request.dto.js';
import {
  CreateSchoolResponseDto,
  SchoolResponseDto,
  SchoolSummaryResponseDto,
} from '../dto/school.response.dto.js';

@ApiTags('Schools')
@ApiBearerAuth('JWT')
@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new school' })
  @ApiResponse({ status: 201, type: CreateSchoolResponseDto })
  async createSchool(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSchoolRequestDto,
  ): Promise<CreateSchoolResponseDto> {
    return this.commandBus.execute(
      new CreateSchoolCommand(user.sub, dto.name, dto.description, dto.avatarUrl),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all schools I own or belong to' })
  @ApiResponse({ status: 200, type: [SchoolSummaryResponseDto] })
  async listMySchools(
    @CurrentUser() user: JwtPayload,
  ): Promise<SchoolSummaryResponseDto[]> {
    return this.queryBus.execute(new ListMySchoolsQuery(user.sub));
  }

  @Get(':schoolId')
  @ApiOperation({ summary: 'Get school details (members only)' })
  @ApiResponse({ status: 200, type: SchoolResponseDto })
  @ApiResponse({ status: 403, description: 'Not a member' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async getSchool(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolResponseDto> {
    return this.queryBus.execute(new GetSchoolQuery(schoolId, user.sub));
  }

  @Patch(':schoolId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update school details and policies (owner/admin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async updateSchool(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: UpdateSchoolRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateSchoolCommand(
        user.sub,
        schoolId,
        dto.name,
        dto.description,
        dto.avatarUrl,
        dto.requireTutorReviewForSelfPaced,
        dto.defaultExplanationLanguage,
      ),
    );
  }

  @Delete(':schoolId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a school (owner only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async deleteSchool(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteSchoolCommand(user.sub, schoolId));
  }

  @Post(':schoolId/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a member directly (owner/admin only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  @ApiResponse({ status: 409, description: 'Member already exists' })
  async addMember(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: AddMemberRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddMemberCommand(user.sub, schoolId, dto.userId, dto.role),
    );
  }

  @Delete(':schoolId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the school (or leave)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'School not found' })
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveMemberCommand(user.sub, schoolId, userId),
    );
  }
}
