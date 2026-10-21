import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
import { RunDiagnosticCommand } from '../application/run-diagnostic.command.js';
import type { DiagnosticResult } from '../application/run-diagnostic.handler.js';
import { DiagnosticResponseDto, RunDiagnosticDto } from './diagnostic.dto.js';

@ApiTags('Admin — bindings')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/ai/diagnostic')
export class AdminDiagnosticController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Echo through the gateway under the "diagnostic" binding',
    description:
      'Shows which model answered and every model the router considered — the way to check a binding, ' +
      'its fallback and the breaker. Every outcome, including "disabled", is a 200.',
  })
  @ApiOkResponse({ type: DiagnosticResponseDto })
  run(@Body() body: RunDiagnosticDto): Promise<DiagnosticResult> {
    return this.commandBus.execute(new RunDiagnosticCommand(body.text ?? 'ping'));
  }
}
