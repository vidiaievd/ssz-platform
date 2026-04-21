import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Result } from '../../../../shared/kernel/result.js';

// Commands — usage examples
import { CreateUsageExampleCommand } from '../../application/commands/create-usage-example/create-usage-example.command.js';
import type { CreateUsageExampleResult } from '../../application/commands/create-usage-example/create-usage-example.handler.js';
import { UpdateUsageExampleCommand } from '../../application/commands/update-usage-example/update-usage-example.command.js';
import { DeleteUsageExampleCommand } from '../../application/commands/delete-usage-example/delete-usage-example.command.js';

// Commands — example translations
import { UpsertExampleTranslationCommand } from '../../application/commands/upsert-example-translation/upsert-example-translation.command.js';
import type { UpsertExampleTranslationResult } from '../../application/commands/upsert-example-translation/upsert-example-translation.handler.js';
import { DeleteExampleTranslationCommand } from '../../application/commands/delete-example-translation/delete-example-translation.command.js';

// Domain types
import type { VocabularyDomainError } from '../../domain/exceptions/vocabulary-domain.exceptions.js';

// Request DTOs
import { CreateUsageExampleRequestDto } from '../dto/requests/create-usage-example.request.dto.js';
import { UpdateUsageExampleRequestDto } from '../dto/requests/update-usage-example.request.dto.js';
import { UpsertExampleTranslationRequestDto } from '../dto/requests/upsert-example-translation.request.dto.js';

// Error mapper
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Vocabulary Examples')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vocabulary-lists/:listId/items/:itemId/examples')
export class VocabularyExampleController {
  constructor(private readonly commandBus: CommandBus) {}

  // ── Usage examples ─────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Add a usage example to a vocabulary item' })
  @ApiCreatedResponse({ description: 'Returns the new example ID' })
  async createExample(
    @Param('itemId') itemId: string,
    @Body() dto: CreateUsageExampleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ exampleId: string }> {
    const result = await this.commandBus.execute<
      CreateUsageExampleCommand,
      Result<CreateUsageExampleResult, VocabularyDomainError>
    >(
      new CreateUsageExampleCommand(
        user.userId,
        itemId,
        dto.exampleText,
        dto.audioMediaId,
        dto.contextNote,
        dto.position,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Patch(':exampleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update a usage example' })
  @ApiNoContentResponse()
  async updateExample(
    @Param('itemId') itemId: string,
    @Param('exampleId') exampleId: string,
    @Body() dto: UpdateUsageExampleRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateUsageExampleCommand,
      Result<void, VocabularyDomainError>
    >(
      new UpdateUsageExampleCommand(
        user.userId,
        itemId,
        exampleId,
        dto.exampleText,
        dto.audioMediaId,
        dto.contextNote,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':exampleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a usage example (cascades to all its translations)' })
  @ApiNoContentResponse()
  async deleteExample(
    @Param('itemId') itemId: string,
    @Param('exampleId') exampleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteUsageExampleCommand,
      Result<void, VocabularyDomainError>
    >(new DeleteUsageExampleCommand(user.userId, itemId, exampleId));

    if (result.isFail) throwHttpException(result.error);
  }

  // ── Example translations ───────────────────────────────────────────────────

  @Put(':exampleId/translations/:lang')
  @ApiOperation({ summary: 'Create or update a translation for a usage example' })
  @ApiOkResponse({ description: 'Returns the translation ID' })
  async upsertExampleTranslation(
    @Param('itemId') itemId: string,
    @Param('exampleId') exampleId: string,
    @Param('lang') lang: string,
    @Body() dto: UpsertExampleTranslationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ translationId: string }> {
    const result = await this.commandBus.execute<
      UpsertExampleTranslationCommand,
      Result<UpsertExampleTranslationResult, VocabularyDomainError>
    >(
      new UpsertExampleTranslationCommand(user.userId, itemId, exampleId, lang, dto.translatedText),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Delete(':exampleId/translations/:lang')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the translation of a usage example for a given language' })
  @ApiNoContentResponse()
  async deleteExampleTranslation(
    @Param('itemId') itemId: string,
    @Param('exampleId') exampleId: string,
    @Param('lang') lang: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      DeleteExampleTranslationCommand,
      Result<void, VocabularyDomainError>
    >(new DeleteExampleTranslationCommand(user.userId, itemId, exampleId, lang));

    if (result.isFail) throwHttpException(result.error);
  }
}
