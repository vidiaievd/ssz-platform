import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';

/**
 * `health` is what the compose healthcheck calls inside the network; `ai/health` is the
 * same answer under the prefix the gateway forwards, so liveness can be checked from outside.
 */
@ApiTags('Health')
@Controller(['health', 'ai/health'])
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
