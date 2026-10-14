import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import { PersonalVocabularyDomainError } from '../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import type { PersonalWordView } from '../../domain/repositories/personal-vocabulary.reader.interface.js';
import { CaptureWordCommand } from '../../application/commands/capture-word/capture-word.command.js';
import type {
  CaptureWordError,
  CaptureWordResult,
} from '../../application/commands/capture-word/capture-word.handler.js';
import { UpdateMyWordCommand } from '../../application/commands/update-my-word/update-my-word.command.js';
import type { UpdateMyWordError } from '../../application/commands/update-my-word/update-my-word.handler.js';
import { DeleteMyWordCommand } from '../../application/commands/delete-my-word/delete-my-word.command.js';
import { LookupWordQuery } from '../../application/queries/lookup-word/lookup-word.query.js';
import type { LookupWordResult } from '../../application/queries/lookup-word/lookup-word.handler.js';
import { ListMyWordsQuery } from '../../application/queries/list-my-words/list-my-words.query.js';
import {
  CaptureWordRequestDto,
  ListMyWordsRequestDto,
  LookupWordRequestDto,
  UpdateMyWordRequestDto,
} from '../dto/requests/personal-vocabulary.request.dto.js';
import {
  CaptureWordResponseDto,
  LookupWordResponseDto,
  PersonalWordResponseDto,
} from '../dto/responses/personal-word.response.dto.js';
import { throwHttpException } from '../utils/personal-vocabulary-error.mapper.js';

/**
 * The student's own dictionary — words they added from texts (plan 75). Every route is
 * scoped to the caller: there is no user id in a path, and someone else's entry answers
 * 404 exactly like a missing one.
 */
@ApiTags('Personal vocabulary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('personal-vocabulary')
export class PersonalVocabularyController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My words, newest first' })
  @ApiOkResponse({ type: [PersonalWordResponseDto] })
  async list(
    @Query() dto: ListMyWordsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonalWordResponseDto[]> {
    const words = await this.queryBus.execute<ListMyWordsQuery, PersonalWordView[]>(
      new ListMyWordsQuery(user.userId, dto.translationLanguage, dto.targetLanguage, dto.status),
    );
    return words.map((w) => PersonalWordResponseDto.from(w));
  }

  @Get('lookup')
  @ApiOperation({
    summary:
      'What is known about a selected word before it is added — from my words and the catalogue',
  })
  @ApiOkResponse({ type: LookupWordResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'INVALID_SURFACE_FORM — empty, too long or several words',
  })
  async lookup(
    @Query() dto: LookupWordRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LookupWordResponseDto> {
    const result = await this.queryBus.execute<
      LookupWordQuery,
      Result<LookupWordResult, PersonalVocabularyDomainError>
    >(new LookupWordQuery(user.userId, dto.targetLanguage, dto.translationLanguage, dto.form));
    if (result.isFail) throwHttpException(result.error);
    return LookupWordResponseDto.from(result.value);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a word from a text to my words — saved even without a translation',
  })
  @ApiOkResponse({
    type: CaptureWordResponseDto,
    description: 'Added, or already there (created=false)',
  })
  @ApiUnprocessableEntityResponse({
    description: 'INVALID_SURFACE_FORM — empty, too long or several words',
  })
  @HttpCode(HttpStatus.OK)
  async capture(
    @Body() dto: CaptureWordRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CaptureWordResponseDto> {
    const hasContext =
      dto.contextSentence !== undefined ||
      dto.sourceVariantId !== undefined ||
      dto.sourceParagraph !== undefined ||
      dto.sourceCharStart !== undefined;
    const result = await this.commandBus.execute<
      CaptureWordCommand,
      Result<CaptureWordResult, CaptureWordError>
    >(
      new CaptureWordCommand(
        user.userId,
        dto.targetLanguage,
        dto.translationLanguage,
        dto.surfaceForm,
        dto.translation ?? null,
        hasContext
          ? {
              sentence: dto.contextSentence?.trim() || null,
              variantId: dto.sourceVariantId ?? null,
              paragraphIndex: dto.sourceParagraph ?? null,
              charStart: dto.sourceCharStart ?? null,
            }
          : null,
      ),
    );
    if (result.isFail) throwHttpException(result.error);
    return CaptureWordResponseDto.from(result.value);
  }

  @Patch(':entryId')
  @ApiOperation({ summary: 'Correct my own word or its translation' })
  @ApiOkResponse({ type: PersonalWordResponseDto })
  @ApiNotFoundResponse({ description: 'ENTRY_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'CATALOG_WORD_READ_ONLY — the word is the course’s; DUPLICATE_WORD_IN_LIST',
  })
  async update(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateMyWordRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonalWordResponseDto> {
    const result = await this.commandBus.execute<
      UpdateMyWordCommand,
      Result<PersonalWordView, UpdateMyWordError>
    >(
      new UpdateMyWordCommand(
        user.userId,
        entryId,
        dto.translationLanguage,
        dto.word,
        dto.translation,
      ),
    );
    if (result.isFail) throwHttpException(result.error);
    return PersonalWordResponseDto.from(result.value);
  }

  @Delete(':entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a word from my words' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'ENTRY_NOT_FOUND' })
  async remove(
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteMyWordCommand,
      Result<void, PersonalVocabularyDomainError>
    >(new DeleteMyWordCommand(user.userId, entryId));
    if (result.isFail) throwHttpException(result.error);
  }
}
