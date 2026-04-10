import { Controller, Get, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetStudentProfileByUserIdQuery } from '../../../students/application/queries/get-student-profile-by-user-id/get-student-profile-by-user-id.query.js';
import { StudentProfileResponseDto } from '../../../students/presentation/dto/student-profile.response.dto.js';
import { GetTutorProfileByUserIdQuery } from '../../../tutors/application/queries/get-tutor-profile-by-user-id/get-tutor-profile-by-user-id.query.js';
import { TutorProfileResponseDto } from '../../../tutors/presentation/dto/tutor-profile.response.dto.js';
import { GetProfileByUserIdQuery } from '../../application/queries/get-profile-by-user-id/get-profile-by-user-id.query.js';
import { ProfileResponseDto } from '../dto/profile.response.dto.js';

@ApiTags('profiles')
@ApiBearerAuth('JWT')
@Controller('profiles')
export class PublicProfilesController {
  constructor(private readonly queryBus: QueryBus) {}

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
