import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AddTargetLanguageCommand } from '../../application/commands/add-target-language/add-target-language.command.js';
import { CreateStudentProfileCommand } from '../../application/commands/create-student-profile/create-student-profile.command.js';
import { RemoveTargetLanguageCommand } from '../../application/commands/remove-target-language/remove-target-language.command.js';
import { UpdateStudentPreferencesCommand } from '../../application/commands/update-student-preferences/update-student-preferences.command.js';
import { UpdateStudentProfileCommand } from '../../application/commands/update-student-profile/update-student-profile.command.js';
import { GetStudentPreferencesQuery } from '../../application/queries/get-student-preferences/get-student-preferences.query.js';
import { GetStudentProfileQuery } from '../../application/queries/get-student-profile/get-student-profile.query.js';
import { AddTargetLanguageRequestDto } from '../dto/add-target-language.request.dto.js';
import { CreateStudentProfileRequestDto } from '../dto/create-student-profile.request.dto.js';
import { StudentPreferencesResponseDto } from '../dto/student-preferences.response.dto.js';
import { UpdateStudentPreferencesRequestDto } from '../dto/update-student-preferences.request.dto.js';
import { UpdateStudentProfileRequestDto } from '../dto/update-student-profile.request.dto.js';
import { StudentProfileResponseDto } from '../dto/student-profile.response.dto.js';

@ApiTags('student-profiles')
@ApiBearerAuth('JWT')
@Controller('profiles/me/student')
export class StudentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get my student profile' })
  @ApiResponse({ status: 200, type: StudentProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Student profile not found' })
  async getMyStudentProfile(
    @CurrentUser() user: JwtPayload,
  ): Promise<StudentProfileResponseDto> {
    return this.queryBus.execute(new GetStudentProfileQuery(user.sub));
  }

  @Post()
  @Roles('student')
  @ApiOperation({ summary: 'Create my student profile' })
  @ApiResponse({
    status: 201,
    description: 'Student profile created, returns id',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires student role' })
  @ApiResponse({ status: 404, description: 'Base profile not found' })
  @ApiResponse({ status: 409, description: 'Student profile already exists' })
  async createMyStudentProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStudentProfileRequestDto,
  ): Promise<{ id: string }> {
    const id = await this.commandBus.execute(
      new CreateStudentProfileCommand(
        user.sub,
        dto.nativeLanguage,
        dto.targetLanguages?.map((l) => ({
          languageCode: l.code,
          level: l.level as any,
        })),
      ),
    );
    return { id };
  }

  @Patch()
  @ApiOperation({ summary: 'Update my student profile' })
  @ApiResponse({ status: 200, type: StudentProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Student profile not found' })
  async updateMyStudentProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateStudentProfileRequestDto,
  ): Promise<StudentProfileResponseDto> {
    await this.commandBus.execute(
      new UpdateStudentProfileCommand(user.sub, dto.nativeLanguage),
    );
    return this.queryBus.execute(new GetStudentProfileQuery(user.sub));
  }

  @Get('preferences')
  @Roles('student')
  @ApiOperation({
    summary: 'Get my account-level learning preferences',
    description:
      'Daily goal and translation language, shared by every device of the learner. ' +
      'A learner who never chose anything gets nulls, not 404.',
  })
  @ApiResponse({ status: 200, type: StudentPreferencesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires student role' })
  @ApiResponse({ status: 404, description: 'Base profile not found' })
  async getMyPreferences(
    @CurrentUser() user: JwtPayload,
  ): Promise<StudentPreferencesResponseDto> {
    return this.queryBus.execute(new GetStudentPreferencesQuery(user.sub));
  }

  @Patch('preferences')
  @Roles('student')
  @ApiOperation({
    summary: 'Change my account-level learning preferences',
    description:
      'Fields left out stay as they are, null clears one. Last write wins. ' +
      'Starts the student profile if the learner has none yet.',
  })
  @ApiResponse({ status: 200, type: StudentPreferencesResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires student role' })
  @ApiResponse({ status: 404, description: 'Base profile not found' })
  async updateMyPreferences(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateStudentPreferencesRequestDto,
  ): Promise<StudentPreferencesResponseDto> {
    await this.commandBus.execute(
      new UpdateStudentPreferencesCommand(user.sub, {
        dailyGoalMin: dto.dailyGoalMin,
        translationLanguage: dto.translationLanguage,
      }),
    );
    return this.queryBus.execute(new GetStudentPreferencesQuery(user.sub));
  }

  @Post('languages')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a target language to my student profile' })
  @ApiResponse({ status: 204, description: 'Language added' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Student profile not found' })
  async addTargetLanguage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddTargetLanguageRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddTargetLanguageCommand(
        user.sub,
        dto.languageCode,
        dto.level as any,
      ),
    );
  }

  @Delete('languages/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a target language from my student profile' })
  @ApiParam({
    name: 'code',
    description: 'ISO 639-1 language code',
    example: 'en',
  })
  @ApiResponse({ status: 204, description: 'Language removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Student profile not found' })
  async removeTargetLanguage(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveTargetLanguageCommand(user.sub, code),
    );
  }
}
