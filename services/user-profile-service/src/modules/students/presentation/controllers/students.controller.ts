import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AddTargetLanguageCommand } from '../../application/commands/add-target-language/add-target-language.command.js';
import { CreateStudentProfileCommand } from '../../application/commands/create-student-profile/create-student-profile.command.js';
import { RemoveTargetLanguageCommand } from '../../application/commands/remove-target-language/remove-target-language.command.js';
import { GetStudentProfileQuery } from '../../application/queries/get-student-profile/get-student-profile.query.js';
import { AddTargetLanguageRequestDto } from '../dto/add-target-language.request.dto.js';
import { CreateStudentProfileRequestDto } from '../dto/create-student-profile.request.dto.js';
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
  @ApiOperation({ summary: 'Create my student profile' })
  @ApiResponse({
    status: 201,
    description: 'Student profile created, returns id',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Base profile not found' })
  @ApiResponse({ status: 409, description: 'Student profile already exists' })
  async createMyStudentProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStudentProfileRequestDto,
  ): Promise<{ id: string }> {
    const id = await this.commandBus.execute(
      new CreateStudentProfileCommand(user.sub, dto.nativeLanguage),
    );
    return { id };
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
      new AddTargetLanguageCommand(user.sub, dto.languageCode),
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
