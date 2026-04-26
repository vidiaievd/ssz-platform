import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateAssignmentCommand } from '../application/commands/create-assignment.command.js';
import { CancelAssignmentCommand } from '../application/commands/cancel-assignment.command.js';
import { UpdateAssignmentDueDateCommand } from '../application/commands/update-assignment-due-date.command.js';
import { GetAssignmentByIdQuery } from '../application/queries/get-assignment-by-id.query.js';
import { ListStudentAssignmentsQuery } from '../application/queries/list-student-assignments.query.js';
import { ListTutorAssignmentsQuery } from '../application/queries/list-tutor-assignments.query.js';
import {
  AssignmentApplicationError,
  AssignmentNotFoundError,
  AssignmentForbiddenError,
  AssignmentDomainValidationError,
  InvalidContentRefError,
  ContentNotVisibleForAssigneeError,
  InsufficientSchoolRoleError,
  ContentServiceUnavailableError,
  OrganizationServiceUnavailableError,
} from '../application/errors/assignment-application.errors.js';
import { CreateAssignmentRequest } from './dto/create-assignment.request.js';
import { CancelAssignmentRequest } from './dto/cancel-assignment.request.js';
import { UpdateDueDateRequest } from './dto/update-due-date.request.js';
import { AssignmentResponse } from './dto/assignment.response.js';
import type { Result } from '../../../shared/kernel/result.js';

@ApiTags('Assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new assignment' })
  @ApiResponse({ status: 201, type: AssignmentResponse })
  @ApiResponse({ status: 400, description: 'Invalid content reference' })
  @ApiResponse({ status: 403, description: 'Insufficient school role' })
  @ApiResponse({ status: 422, description: 'Content not visible for assignee' })
  @ApiResponse({ status: 502, description: 'Upstream service unavailable' })
  async create(
    @Body() body: CreateAssignmentRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssignmentResponse> {
    const result = await this.commandBus.execute(
      new CreateAssignmentCommand(
        user.userId,
        body.assigneeId,
        body.schoolId,
        body.contentType,
        body.contentId,
        new Date(body.dueAt),
        body.notes,
      ),
    );
    return this.unwrap(result);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List assignments assigned to the current student' })
  @ApiQuery({ name: 'status', required: false, isArray: true, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE'] })
  @ApiQuery({ name: 'dueWithinDays', required: false, type: Number })
  @ApiResponse({ status: 200, type: [AssignmentResponse] })
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string | string[],
    @Query('dueWithinDays') dueWithinDays?: string,
  ): Promise<AssignmentResponse[]> {
    const statusArr = status
      ? (Array.isArray(status) ? status : [status]) as any[]
      : undefined;
    return this.queryBus.execute(
      new ListStudentAssignmentsQuery(
        user.userId,
        statusArr,
        dueWithinDays !== undefined ? parseInt(dueWithinDays, 10) : undefined,
      ),
    );
  }

  @Get('given')
  @ApiOperation({ summary: 'List assignments created by the current tutor' })
  @ApiQuery({ name: 'status', required: false, isArray: true, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'OVERDUE'] })
  @ApiQuery({ name: 'assigneeId', required: false, type: String, format: 'uuid' })
  @ApiResponse({ status: 200, type: [AssignmentResponse] })
  async listGiven(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string | string[],
    @Query('assigneeId') assigneeId?: string,
  ): Promise<AssignmentResponse[]> {
    const statusArr = status
      ? (Array.isArray(status) ? status : [status]) as any[]
      : undefined;
    return this.queryBus.execute(
      new ListTutorAssignmentsQuery(user.userId, statusArr, assigneeId),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single assignment by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: AssignmentResponse })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssignmentResponse> {
    const result = await this.queryBus.execute(
      new GetAssignmentByIdQuery(id, user.userId, user.roles),
    );
    return this.unwrap(result);
  }

  @Patch(':id/due-date')
  @ApiOperation({ summary: 'Update assignment due date' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: AssignmentResponse })
  @ApiResponse({ status: 403, description: 'Only assigner can update due date' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  @ApiResponse({ status: 422, description: 'Due date in the past' })
  async updateDueDate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDueDateRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssignmentResponse> {
    const result = await this.commandBus.execute(
      new UpdateAssignmentDueDateCommand(id, new Date(body.dueAt), user.userId),
    );
    return this.unwrap(result);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an assignment' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: AssignmentResponse })
  @ApiResponse({ status: 403, description: 'Only assigner or school admin can cancel' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  @ApiResponse({ status: 422, description: 'Assignment already in terminal state' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelAssignmentRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssignmentResponse> {
    const result = await this.commandBus.execute(
      new CancelAssignmentCommand(id, user.userId, user.roles, body.reason),
    );
    return this.unwrap(result);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private unwrap<T>(result: Result<T, any>): T {
    if (result.isOk) return result.value;

    const err = result.error as AssignmentApplicationError;

    if (err instanceof AssignmentNotFoundError) throw new NotFoundException(err.message);
    if (err instanceof AssignmentForbiddenError) throw new ForbiddenException(err.message);
    if (err instanceof AssignmentDomainValidationError) throw new UnprocessableEntityException(err.message);
    if (err instanceof InvalidContentRefError) throw new BadRequestException(err.message);
    if (err instanceof ContentNotVisibleForAssigneeError) throw new UnprocessableEntityException(err.message);
    if (err instanceof InsufficientSchoolRoleError) throw new ForbiddenException(err.message);
    if (err instanceof ContentServiceUnavailableError) throw new BadGatewayException(err.message);
    if (err instanceof OrganizationServiceUnavailableError) throw new BadGatewayException(err.message);

    throw new UnprocessableEntityException(err.message ?? 'Unhandled business error');
  }
}
