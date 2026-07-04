import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { CanDoDescriptorEntity } from '../../domain/entities/can-do-descriptor.entity.js';
import type { CanDoDomainError } from '../../domain/exceptions/can-do-domain.exceptions.js';
import { CanDoScope } from '../../domain/value-objects/can-do-scope.vo.js';
import { CanDoSkill } from '../../domain/value-objects/can-do-skill.vo.js';
import { CreateCanDoDescriptorCommand } from '../../application/commands/create-descriptor/create-descriptor.command.js';
import { ListCanDoDescriptorsQuery } from '../../application/queries/list-descriptors/list-descriptors.query.js';
import { GetCanDoDescriptorsByModuleQuery } from '../../application/queries/get-descriptors-by-module/get-descriptors-by-module.query.js';
import {
  CreateCanDoDescriptorDto,
  CanDoDescriptorResponse,
} from '../dto/can-do-descriptor.dto.js';
import type { CefrLevel } from '../../domain/entities/can-do-descriptor.entity.js';

@ApiTags('can-do')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('can-do/descriptors')
export class CanDoDescriptorController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a can-do descriptor (platform admin or content_admin for school scope)' })
  @ApiCreatedResponse({ type: CanDoDescriptorResponse })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCanDoDescriptorDto,
  ): Promise<CanDoDescriptorResponse> {
    const result: Result<CanDoDescriptorEntity, CanDoDomainError> =
      await this.commandBus.execute(
        new CreateCanDoDescriptorCommand(
          user.userId,
          user.roles?.includes('platform_admin') ?? false,
          body.cefrLevel,
          body.skill,
          body.scope,
          body.localizations,
          body.ownerSchoolId,
          body.source,
        ),
      );
    if (result.isFail) throw new NotFoundException(result.error);
    return CanDoDescriptorResponse.fromEntity(result.value);
  }

  @Get()
  @ApiOperation({ summary: 'List can-do descriptors (GLOBAL always readable; filter by scope/level/skill)' })
  @ApiOkResponse({ type: [CanDoDescriptorResponse] })
  async list(
    @Query('scope') scope?: string,
    @Query('ownerSchoolId') ownerSchoolId?: string,
    @Query('cefrLevel') cefrLevel?: string,
    @Query('skill') skill?: string,
  ): Promise<CanDoDescriptorResponse[]> {
    const descriptors: CanDoDescriptorEntity[] = await this.queryBus.execute(
      new ListCanDoDescriptorsQuery(
        scope as CanDoScope | undefined,
        ownerSchoolId ?? null,
        cefrLevel as CefrLevel | undefined,
        skill as CanDoSkill | undefined,
      ),
    );
    return descriptors.map(CanDoDescriptorResponse.fromEntity);
  }

  @Get('by-module/:moduleId')
  @ApiOperation({ summary: "List can-do descriptors targeted by a module (MODULE → TARGETS → CanDoDescriptor)" })
  @ApiOkResponse({ type: [CanDoDescriptorResponse] })
  async listByModule(
    @Param('moduleId') moduleId: string,
  ): Promise<CanDoDescriptorResponse[]> {
    const descriptors: CanDoDescriptorEntity[] = await this.queryBus.execute(
      new GetCanDoDescriptorsByModuleQuery(moduleId),
    );
    return descriptors.map(CanDoDescriptorResponse.fromEntity);
  }
}
