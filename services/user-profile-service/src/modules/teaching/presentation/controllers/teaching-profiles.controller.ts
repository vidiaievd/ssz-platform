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
import { CreateTeachingProfileCommand } from '../../application/commands/create-teaching-profile/create-teaching-profile.command.js';
import { AddTeachingLanguageCommand } from '../../application/commands/add-teaching-language/add-teaching-language.command.js';
import { RemoveTeachingLanguageCommand } from '../../application/commands/remove-teaching-language/remove-teaching-language.command.js';
import { GetTeachingProfileQuery } from '../../application/queries/get-teaching-profile/get-teaching-profile.query.js';
import { AddTeachingLanguageRequestDto } from '../dto/add-teaching-language.request.dto.js';
import { TeachingProfileResponseDto } from '../dto/teaching-profile.response.dto.js';

@ApiTags('teaching-profiles')
@ApiBearerAuth('JWT')
@Controller('profiles/me/teaching')
export class TeachingProfilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create my teaching profile (teacher + tutor base)' })
  @ApiResponse({ status: 201, description: 'Created', schema: { properties: { id: { type: 'string' } } } })
  @ApiResponse({ status: 409, description: 'Teaching profile already exists' })
  async createMyTeachingProfile(@CurrentUser() user: JwtPayload): Promise<{ id: string }> {
    const id = await this.commandBus.execute(new CreateTeachingProfileCommand(user.sub));
    return { id };
  }

  @Get()
  @ApiOperation({ summary: 'Get my teaching profile' })
  @ApiResponse({ status: 200, type: TeachingProfileResponseDto })
  @ApiResponse({ status: 404, description: 'Teaching profile not found' })
  async getMyTeachingProfile(@CurrentUser() user: JwtPayload): Promise<TeachingProfileResponseDto> {
    return this.queryBus.execute(new GetTeachingProfileQuery(user.sub));
  }

  @Post('languages')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add a teaching language' })
  @ApiResponse({ status: 204, description: 'Language added' })
  @ApiResponse({ status: 409, description: 'Language already added' })
  async addLanguage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddTeachingLanguageRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(new AddTeachingLanguageCommand(user.sub, dto.code, dto.level));
  }

  @Delete('languages/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a teaching language' })
  @ApiParam({ name: 'code', description: 'ISO 639-1 language code', example: 'nb' })
  @ApiResponse({ status: 204, description: 'Language removed' })
  @ApiResponse({ status: 404, description: 'Language not found' })
  async removeLanguage(
    @CurrentUser() user: JwtPayload,
    @Param('code') code: string,
  ): Promise<void> {
    await this.commandBus.execute(new RemoveTeachingLanguageCommand(user.sub, code));
  }
}
