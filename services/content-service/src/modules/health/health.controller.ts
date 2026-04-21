import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'content-service',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
