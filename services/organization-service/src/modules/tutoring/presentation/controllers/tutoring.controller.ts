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
import { Roles } from '../../../../common/decorators/roles.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateTutoringGroupCommand } from '../../application/commands/create-tutoring-group/create-tutoring-group.command.js';
import { UpdateTutoringGroupCommand } from '../../application/commands/update-tutoring-group/update-tutoring-group.command.js';
import { DeleteTutoringGroupCommand } from '../../application/commands/delete-tutoring-group/delete-tutoring-group.command.js';
import { RemoveStudentCommand } from '../../application/commands/remove-student/remove-student.command.js';
import { GetMyGroupQuery } from '../../application/queries/get-my-group/get-my-group.query.js';
import { GetMyTutorQuery } from '../../application/queries/get-my-tutor/get-my-tutor.query.js';
import { CreateTutoringGroupRequestDto } from '../dto/create-tutoring-group.request.dto.js';
import { UpdateTutoringGroupRequestDto } from '../dto/update-tutoring-group.request.dto.js';
import {
  CreateTutoringGroupResponseDto,
  TutoringGroupResponseDto,
  TutoringGroupSummaryResponseDto,
} from '../dto/tutoring-group.response.dto.js';

@ApiTags('Tutoring')
@ApiBearerAuth('JWT')
@Controller('tutoring')
export class TutoringController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('group')
  @Roles('tutor')
  @ApiOperation({ summary: 'Create tutoring group (one per tutor)' })
  @ApiResponse({ status: 201, type: CreateTutoringGroupResponseDto })
  @ApiResponse({ status: 403, description: 'Requires tutor platform role' })
  @ApiResponse({ status: 409, description: 'Tutor already has a group' })
  async createGroup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTutoringGroupRequestDto,
  ): Promise<CreateTutoringGroupResponseDto> {
    return this.commandBus.execute(
      new CreateTutoringGroupCommand(user.sub, dto.name, dto.description, dto.avatarUrl),
    );
  }

  @Get('group')
  @Roles('tutor')
  @ApiOperation({ summary: "Get tutor's own group with students" })
  @ApiResponse({ status: 200, type: TutoringGroupResponseDto })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async getMyGroup(@CurrentUser() user: JwtPayload): Promise<TutoringGroupResponseDto> {
    return this.queryBus.execute(new GetMyGroupQuery(user.sub));
  }

  @Patch('group')
  @Roles('tutor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Update tutor's group details" })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async updateGroup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTutoringGroupRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateTutoringGroupCommand(user.sub, dto.name, dto.description, dto.avatarUrl),
    );
  }

  @Delete('group')
  @Roles('tutor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete tutor's group" })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async deleteGroup(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.commandBus.execute(new DeleteTutoringGroupCommand(user.sub));
  }

  @Get('my-tutor')
  @ApiOperation({ summary: "Student: get info about their tutor's group" })
  @ApiResponse({ status: 200, type: TutoringGroupSummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Not enrolled with any tutor' })
  async getMyTutor(@CurrentUser() user: JwtPayload): Promise<TutoringGroupSummaryResponseDto> {
    return this.queryBus.execute(new GetMyTutorQuery(user.sub));
  }

  @Delete('group/students/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a student (tutor removes someone, or student leaves)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async removeStudent(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.commandBus.execute(new RemoveStudentCommand(user.sub, userId));
  }
}
