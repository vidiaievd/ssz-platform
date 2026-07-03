import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import {
  CAN_DO_PROGRESS_REPOSITORY,
  type ICanDoProgressRepository,
} from '../../domain/repositories/can-do-progress.repository.interface.js';
import type { CanDoProgressEntity } from '../../domain/entities/can-do-progress.entity.js';
import { Inject } from '@nestjs/common';

class SelfAssessDto {
  @ApiProperty()
  @IsBoolean()
  confident!: boolean;
}

class CanDoProgressResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  descriptorId!: string;

  @ApiProperty({ enum: ['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED'] })
  status!: string;

  @ApiProperty({ nullable: true })
  achievedAt!: string | null;

  @ApiProperty({ nullable: true })
  selfAssessed!: boolean | null;

  static fromEntity(e: CanDoProgressEntity): CanDoProgressResponse {
    return {
      id: e.id,
      descriptorId: e.descriptorId,
      status: e.status,
      achievedAt: e.achievedAt?.toISOString() ?? null,
      selfAssessed: e.selfAssessed,
    };
  }
}

@ApiTags('can-do')
@ApiBearerAuth()
@Controller('can-do/progress')
export class CanDoProgressController {
  constructor(
    @Inject(CAN_DO_PROGRESS_REPOSITORY)
    private readonly progressRepo: ICanDoProgressRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List can-do progress for the current user (optionally filtered by courseId)' })
  @ApiQuery({ name: 'courseId', required: false, format: 'uuid' })
  @ApiOkResponse({ type: [CanDoProgressResponse] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('courseId') courseId?: string,
  ): Promise<CanDoProgressResponse[]> {
    const entries = courseId
      ? await this.progressRepo.findByUserAndCourse(user.userId, courseId)
      : await this.progressRepo.findByUserId(user.userId);
    return entries.map(CanDoProgressResponse.fromEntity);
  }

  @Patch(':id/self-assess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit self-assessment confidence for a can-do descriptor' })
  @ApiOkResponse({ type: CanDoProgressResponse })
  async selfAssess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') descriptorId: string,
    @Body() body: SelfAssessDto,
  ): Promise<CanDoProgressResponse> {
    let progress = await this.progressRepo.findByUserAndDescriptor(user.userId, descriptorId);
    if (!progress) throw new NotFoundException('Can-do progress record not found');

    progress.setSelfAssessed(body.confident);
    await this.progressRepo.upsert(progress);
    return CanDoProgressResponse.fromEntity(progress);
  }
}
