import {
  BadGatewayException,
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
  ApiConflictResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { EnrollInContainerCommand } from '../application/commands/enroll-in-container.command.js';
import { UnenrollFromContainerCommand } from '../application/commands/unenroll-from-container.command.js';
import { MarkEnrollmentCompleteCommand } from '../application/commands/mark-enrollment-complete.command.js';
import { GetEnrollmentQuery } from '../application/queries/get-enrollment.query.js';
import { ListUserEnrollmentsQuery } from '../application/queries/list-user-enrollments.query.js';
import {
  EnrollmentApplicationError,
  EnrollmentNotFoundError,
  EnrollmentForbiddenError,
  EnrollmentAlreadyExistsError,
  EnrollmentDomainValidationError,
  AccessDeniedForContainerError,
  ContentServiceUnavailableError,
  OrganizationServiceUnavailableError,
} from '../application/errors/enrollment-application.errors.js';
import { EnrollInContainerRequest } from './dto/enroll-in-container.request.js';
import { UnenrollRequest } from './dto/unenroll.request.js';
import { EnrollmentResponse } from './dto/enrollment.response.js';
import type { Result } from '../../../shared/kernel/result.js';
import { ConflictException } from '@nestjs/common';

@ApiTags('Enrollments')
@ApiBearerAuth()
@Controller('enrollments')
export class EnrollmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Enroll the current user in a container' })
  @ApiResponse({ status: 201, type: EnrollmentResponse })
  @ApiConflictResponse({ description: 'Already enrolled in this container' })
  @ApiResponse({ status: 403, description: 'Access denied for this content tier' })
  @ApiResponse({ status: 502, description: 'Upstream service unavailable' })
  async enroll(
    @Body() body: EnrollInContainerRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EnrollmentResponse> {
    const result = await this.commandBus.execute(
      new EnrollInContainerCommand(user.userId, body.containerId, body.schoolId),
    );
    return this.unwrap(result);
  }

  @Get()
  @ApiOperation({ summary: 'List enrollments for the current user' })
  @ApiQuery({ name: 'status', required: false, isArray: true, enum: ['ACTIVE', 'COMPLETED', 'UNENROLLED'] })
  @ApiResponse({ status: 200, type: [EnrollmentResponse] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string | string[],
  ): Promise<EnrollmentResponse[]> {
    const statusArr = status
      ? (Array.isArray(status) ? status : [status]) as any[]
      : undefined;
    return this.queryBus.execute(
      new ListUserEnrollmentsQuery(user.userId, statusArr),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single enrollment by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EnrollmentResponse })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EnrollmentResponse> {
    const result = await this.queryBus.execute(
      new GetEnrollmentQuery(id, user.userId),
    );
    return this.unwrap(result);
  }

  @Patch(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark an enrollment as completed' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EnrollmentResponse })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @ApiResponse({ status: 422, description: 'Already completed or unenrolled' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EnrollmentResponse> {
    const result = await this.commandBus.execute(
      new MarkEnrollmentCompleteCommand(id, user.userId),
    );
    return this.unwrap(result);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unenroll from a container' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EnrollmentResponse })
  @ApiResponse({ status: 403, description: 'Only the enrolled user can unenroll' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @ApiResponse({ status: 422, description: 'Already completed or unenrolled' })
  async unenroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UnenrollRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EnrollmentResponse> {
    const result = await this.commandBus.execute(
      new UnenrollFromContainerCommand(id, user.userId, body.reason),
    );
    return this.unwrap(result);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private unwrap<T>(result: Result<T, any>): T {
    if (result.isOk) return result.value;

    const err = result.error as EnrollmentApplicationError;

    if (err instanceof EnrollmentNotFoundError) throw new NotFoundException(err.message);
    if (err instanceof EnrollmentForbiddenError) throw new ForbiddenException(err.message);
    if (err instanceof EnrollmentAlreadyExistsError) throw new ConflictException(err.message);
    if (err instanceof EnrollmentDomainValidationError) throw new UnprocessableEntityException(err.message);
    if (err instanceof AccessDeniedForContainerError) throw new ForbiddenException(err.message);
    if (err instanceof ContentServiceUnavailableError) throw new BadGatewayException(err.message);
    if (err instanceof OrganizationServiceUnavailableError) throw new BadGatewayException(err.message);

    throw new UnprocessableEntityException(err.message ?? 'Unhandled business error');
  }
}
