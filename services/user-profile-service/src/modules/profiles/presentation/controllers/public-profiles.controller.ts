import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ListTutorsQuery } from '../../../tutors/application/queries/list-tutors/list-tutors.query.js';
import { GetStudentProfileByUserIdQuery } from '../../../students/application/queries/get-student-profile-by-user-id/get-student-profile-by-user-id.query.js';
import { StudentProfileResponseDto } from '../../../students/presentation/dto/student-profile.response.dto.js';
import { GetTutorProfileByUserIdQuery } from '../../../tutors/application/queries/get-tutor-profile-by-user-id/get-tutor-profile-by-user-id.query.js';
import { TutorListResponseDto } from '../../../tutors/presentation/dto/tutor-list.response.dto.js';
import { TutorProfileResponseDto } from '../../../tutors/presentation/dto/tutor-profile.response.dto.js';
import { GetProfileByUserIdQuery } from '../../application/queries/get-profile-by-user-id/get-profile-by-user-id.query.js';
import { ProfileResponseDto } from '../dto/profile.response.dto.js';

@ApiTags('profiles')
@ApiBearerAuth('JWT')
@Controller('profiles')
export class PublicProfilesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('tutors')
  @ApiOperation({ summary: 'List tutor profiles with optional filters' })
  @ApiQuery({
    name: 'language',
    required: false,
    description: 'Filter by teaching language code (e.g. "en")',
  })
  @ApiQuery({
    name: 'maxRate',
    required: false,
    description: 'Filter by max hourly rate',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (default 20, max 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Pagination offset (default 0)',
  })
  @ApiResponse({ status: 200, type: TutorListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listTutors(
    @Query('language') language?: string,
    @Query('maxRate') maxRate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<TutorListResponseDto> {
    const parsedLimit = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    const parsedOffset = parseInt(offset ?? '0', 10) || 0;
    const parsedMaxRate = maxRate ? parseFloat(maxRate) : undefined;

    return this.queryBus.execute(
      new ListTutorsQuery(language, parsedMaxRate, parsedLimit, parsedOffset),
    );
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get a profile by userId' })
  @ApiParam({ name: 'userId', description: 'UUID of the user' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfileByUserId(
    @Param('userId') userId: string,
  ): Promise<ProfileResponseDto> {
    return this.queryBus.execute(new GetProfileByUserIdQuery(userId));
  }

  @Get(':userId/student')
  @ApiOperation({ summary: 'Get a student profile by userId' })
  @ApiParam({ name: 'userId', description: 'UUID of the user' })
  @ApiResponse({ status: 200, type: StudentProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Student profile not found' })
  async getStudentProfileByUserId(
    @Param('userId') userId: string,
  ): Promise<StudentProfileResponseDto> {
    return this.queryBus.execute(new GetStudentProfileByUserIdQuery(userId));
  }

  @Get(':userId/tutor')
  @ApiOperation({ summary: 'Get a tutor profile by userId' })
  @ApiParam({ name: 'userId', description: 'UUID of the user' })
  @ApiResponse({ status: 200, type: TutorProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Tutor profile not found' })
  async getTutorProfileByUserId(
    @Param('userId') userId: string,
  ): Promise<TutorProfileResponseDto> {
    return this.queryBus.execute(new GetTutorProfileByUserIdQuery(userId));
  }
}
