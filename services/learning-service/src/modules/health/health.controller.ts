import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe — always 200 if process is alive' })
  check() {
    return {
      status: 'ok',
      service: 'learning-service',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
