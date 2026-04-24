import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Service health check' })
  check() {
    return {
      status: 'ok',
      service: 'media-service',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
