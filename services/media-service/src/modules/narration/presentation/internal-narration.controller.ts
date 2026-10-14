import { Body, Controller, HttpCode, HttpStatus, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../common/guards/internal-auth.guard.js';
import { RequestNarrationCommand } from '../application/commands/request-narration/request-narration.command.js';
import type { RequestNarrationOutcome } from '../application/commands/request-narration/request-narration.command.js';
import { InternalRequestNarrationDto, RequestNarrationResponseDto } from './dto/narration.dto.js';

// Service-to-service only: @Public() exempts the route from the global JWT guard,
// InternalAuthGuard demands 'x-internal-token'. Not routed by the gateway.
@ApiTags('internal')
@ApiHeader({ name: 'x-internal-token', required: true, description: 'Shared service token' })
@ApiResponse({ status: 401, description: 'Missing or wrong x-internal-token' })
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/media/narration')
export class InternalNarrationController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Narrate a lesson body on an owner\'s behalf (content-service)',
    description:
      'What POST /media/narration does for an author, for the batch narration of a course ' +
      '(plan 74, phase 4): there is no user token, so the owner is named in the body. The caller ' +
      'has already checked the owner may author the lesson.',
  })
  @ApiResponse({ status: 202, type: RequestNarrationResponseDto })
  @ApiResponse({ status: 422, description: 'Nothing to read, text too long, or unsupported language' })
  async narrate(@Body() dto: InternalRequestNarrationDto): Promise<RequestNarrationResponseDto> {
    const result: RequestNarrationOutcome = await this.commandBus.execute(
      new RequestNarrationCommand(dto.ownerId, dto.bodyMarkdown, dto.lang ?? 'nb', dto.label ?? null,
        dto.lessonId ?? null,
        dto.level ?? null,
        dto.lengthScale ?? null,
        dto.pauseScale ?? null,
      ),
    );
    if (result.isFail) throw new UnprocessableEntityException(result.error);
    return result.value;
  }
}
