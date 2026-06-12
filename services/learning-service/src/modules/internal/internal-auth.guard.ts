import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration.js';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-service-token'] as string | undefined;
    const expected = this.config.get('internalServiceToken') as string | undefined;

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing x-service-token');
    }
    return true;
  }
}
