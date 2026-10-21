import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { PutBindingCommand } from '../../application/commands/put-binding/put-binding.command.js';
import { GetBindingHistoryQuery } from '../../application/queries/get-binding-history/get-binding-history.query.js';
import { GetBindingQuery } from '../../application/queries/get-binding/get-binding.query.js';
import type { CapabilityBinding } from '../../application/queries/list-bindings/list-bindings.handler.js';
import { ListBindingsQuery } from '../../application/queries/list-bindings/list-bindings.query.js';
import type { AiBinding, BindingChange } from '../../domain/binding.js';
import {
  BindingChangeResponseDto,
  BindingResponseDto,
  CapabilityBindingResponseDto,
  PutBindingDto,
  UnprocessableBindingDto,
} from '../dto/binding.dto.js';

const CAPABILITY_PARAM = { name: 'capability', example: 'diagnostic', description: 'Capability code' };

@ApiTags('Admin — bindings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai/bindings')
export class AdminBindingsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every capability with its requirements and binding (null when unbound)' })
  @ApiOkResponse({ type: [CapabilityBindingResponseDto] })
  list(): Promise<CapabilityBinding[]> {
    return this.queryBus.execute(new ListBindingsQuery());
  }

  @Get(':capability')
  @ApiOperation({ summary: "One capability's requirements and binding" })
  @ApiParam(CAPABILITY_PARAM)
  @ApiOkResponse({ type: CapabilityBindingResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown capability' })
  get(@Param('capability') capability: string): Promise<CapabilityBinding> {
    return this.queryBus.execute(new GetBindingQuery(capability));
  }

  @Put(':capability')
  @ApiOperation({
    summary: 'Create or replace the binding',
    description:
      'Both models must exist, not be disabled, sit on a configured provider, meet the capability\'s ' +
      'required features and allow maxOutputTokens. A switched-off provider is accepted — the router ' +
      'steps over it to the fallback. Every write is kept in the history.',
  })
  @ApiParam(CAPABILITY_PARAM)
  @ApiOkResponse({ type: BindingResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown capability' })
  @ApiConflictResponse({ description: 'expectedVersion is stale' })
  @ApiUnprocessableEntityResponse({ type: UnprocessableBindingDto, description: 'What stops the binding, listed' })
  put(
    @Param('capability') capability: string,
    @Body() body: PutBindingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiBinding> {
    const { expectedVersion, ...rest } = body;
    return this.commandBus.execute(
      new PutBindingCommand(
        capability,
        { ...rest, fallbackModelId: rest.fallbackModelId ?? null, temperature: rest.temperature ?? null },
        expectedVersion,
        user.userId,
      ),
    );
  }

  @Get(':capability/history')
  @ApiOperation({ summary: 'Every write to the binding, newest first' })
  @ApiParam(CAPABILITY_PARAM)
  @ApiOkResponse({ type: [BindingChangeResponseDto] })
  @ApiNotFoundResponse({ description: 'Unknown capability' })
  history(@Param('capability') capability: string): Promise<BindingChange[]> {
    return this.queryBus.execute(new GetBindingHistoryQuery(capability));
  }
}
