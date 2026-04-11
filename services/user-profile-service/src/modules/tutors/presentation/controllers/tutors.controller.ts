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
import { AddTeachingLanguageCommand } from '../../application/commands/add-teaching-language/add-teaching-language.command.js';
import { CreateTutorProfileCommand } from '../../application/commands/create-tutor-profile/create-tutor-profile.command.js';
import { RemoveTeachingLanguageCommand } from '../../application/commands/remove-teaching-language/remove-teaching-language.command.js';
import { GetTutorProfileQuery } from '../../application/queries/get-tutor-profile/get-tutor-profile.query.js';
import { AddTeachingLanguageRequestDto } from '../dto/add-teaching-language.request.dto.js';
import { CreateTutorProfileRequestDto } from '../dto/create-tutor-profile.request.dto.js';
import { TutorProfileResponseDto } from '../dto/tutor-profile.response.dto.js';

@ApiTags('tutor-profiles')
@ApiBearerAuth('JWT')
@Controller('profiles/me/tutor')
export class TutorsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get my tutor profile' })
  @ApiResponse({ status: 200, type: TutorProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Tutor profile not found' })
  async getMyTutorProfile(
    @CurrentUser() user: JwtPayload,
  ): Promise<TutorProfileResponseDto> {
    return this.queryBus.execute(new GetTutorProfileQuery(user.sub));
  }

  @Post()
  @ApiOperation({ summary: 'Create my tutor profile' })
  @ApiResponse({
    status: 201,
    description: 'Tutor profile created, returns id',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Base profile not found' })
  @ApiResponse({ status: 409, description: 'Tutor profile already exists' })
  async createMyTutorProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTutorProfileRequestDto,
  ): Promise<{ id: string }> {
    const id = await this.commandBus.execute(
      new CreateTutorProfileCommand(
        user.sub,
        dto.hourlyRate,
        dto.yearsOfExperience,
      ),
    );
    return { id };
  }

  @Post('languages')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a teaching language to my tutor profile' })
  @ApiResponse({ status: 204, description: 'Language added' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Tutor profile not found' })
  async addTeachingLanguage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddTeachingLanguageRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddTeachingLanguageCommand(
        user.sub,
        dto.languageCode,
        dto.proficiency,
      ),
    );
  }

  @Delete('languages/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a teaching language from my tutor profile' })
  @ApiParam({
    name: 'code',
    description: 'ISO 639-1 language code',
    example: 'en',
  })
  @ApiResponse({ status: 204, description: 'Language removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Tutor profile not found' })
  async removeTeachingLanguage(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveTeachingLanguageCommand(user.sub, code),
    );
  }
}
