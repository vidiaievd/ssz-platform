import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto';
import { AddTargetLanguageDto } from './dto/add-target-language.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Student Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles/me/student')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update student profile' })
  @ApiResponse({ status: 200, description: 'Student profile upserted' })
  @ApiResponse({ status: 400, description: 'Not a student profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async upsertStudentProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpsertStudentProfileDto,
  ) {
    return this.studentsService.upsertStudentProfile(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get own student profile with target languages' })
  @ApiResponse({ status: 200, description: 'Student profile retrieved' })
  @ApiResponse({ status: 404, description: 'Student profile not found' })
  async getStudentProfile(@CurrentUser('sub') userId: string) {
    return this.studentsService.getStudentProfile(userId);
  }

  @Post('languages')
  @ApiOperation({ summary: 'Add a target language to study' })
  @ApiResponse({ status: 201, description: 'Language added' })
  @ApiResponse({ status: 409, description: 'Language already in list' })
  async addTargetLanguage(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddTargetLanguageDto,
  ) {
    return this.studentsService.addTargetLanguage(userId, dto);
  }

  @Delete('languages/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a target language' })
  @ApiParam({ name: 'code', example: 'no', description: 'ISO 639-1 language code' })
  @ApiResponse({ status: 204, description: 'Language removed' })
  @ApiResponse({ status: 404, description: 'Language not found' })
  async removeTargetLanguage(
    @CurrentUser('sub') userId: string,
    @Param('code') code: string,
  ): Promise<void> {
    return this.studentsService.removeTargetLanguage(userId, code);
  }
}
