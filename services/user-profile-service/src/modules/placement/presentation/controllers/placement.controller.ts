import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { PlacementNotFoundException } from '../../domain/exceptions/placement-not-found.exception.js';
import { RecordPlacementCommand } from '../../application/commands/record-placement/record-placement.command.js';
import { GetMyPlacementsQuery } from '../../application/queries/get-my-placements/get-my-placements.query.js';
import { GetMyPlacementByLangQuery } from '../../application/queries/get-my-placement-by-lang/get-my-placement-by-lang.query.js';
import { RecordPlacementRequestDto } from '../dto/record-placement.request.dto.js';
import { PlacementResultResponseDto } from '../dto/placement-result.response.dto.js';

@ApiTags('placement')
@ApiBearerAuth('JWT')
@Controller('profiles/me/placement')
export class PlacementController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a placement test result (platform or membership scope)' })
  @ApiResponse({ status: 201, type: PlacementResultResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error (e.g. missing membershipId when scope=membership)' })
  async recordPlacement(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordPlacementRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new RecordPlacementCommand(
        user.sub,
        dto.language,
        dto.cefrLevel,
        dto.score,
        dto.scope,
        dto.membershipId,
        dto.sourceLabel,
        new Date(dto.takenAt),
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all my placement results (all scopes)' })
  @ApiResponse({ status: 200, type: [PlacementResultResponseDto] })
  async getMyPlacements(
    @CurrentUser() user: JwtPayload,
  ): Promise<PlacementResultResponseDto[]> {
    return this.queryBus.execute(new GetMyPlacementsQuery(user.sub));
  }

  @Get(':lang')
  @ApiOperation({ summary: 'Get latest platform-scope placement for a language (404 if none)' })
  @ApiResponse({ status: 200, type: PlacementResultResponseDto })
  @ApiResponse({ status: 404, description: 'No platform placement result found' })
  async getMyPlacementByLang(
    @CurrentUser() user: JwtPayload,
    @Param('lang') lang: string,
  ): Promise<PlacementResultResponseDto> {
    try {
      return await this.queryBus.execute(new GetMyPlacementByLangQuery(user.sub, lang));
    } catch (err) {
      if (err instanceof PlacementNotFoundException) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
