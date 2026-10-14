import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { isAuthor } from '../../../common/authoring-roles.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { RequestNarrationCommand } from '../application/commands/request-narration/request-narration.command.js';
import type { RequestNarrationOutcome } from '../application/commands/request-narration/request-narration.command.js';
import { RequestNarrationDto, RequestNarrationResponseDto } from './dto/narration.dto.js';

@ApiTags('narration')
@ApiBearerAuth()
@Controller('media/narration')
export class NarrationController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Narrate a lesson body with speech synthesis',
    description:
      'Builds the narration script from the markdown (no media tokens, no markup, no speaker ' +
      'names), creates a SYNTHESIZED `lesson_asset` owned by the caller and queues the ' +
      'synthesis. Returns at once; the asset turns READY once spoken and processed, or FAILED.',
  })
  @ApiResponse({ status: 202, type: RequestNarrationResponseDto })
  @ApiResponse({ status: 403, description: 'The caller does not author lessons' })
  @ApiResponse({ status: 422, description: 'Nothing to read, text too long, or unsupported language' })
  async narrate(
    @Body() dto: RequestNarrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestNarrationResponseDto> {
    if (!isAuthor(user.roles)) {
      throw new ForbiddenException('Only lesson authors can request a narration');
    }

    const result: RequestNarrationOutcome = await this.commandBus.execute(
      new RequestNarrationCommand(user.userId, dto.bodyMarkdown, dto.lang ?? 'nb', dto.label ?? null, dto.lessonId ?? null),
    );
    if (result.isFail) throw new UnprocessableEntityException(result.error);

    return result.value;
  }
}
