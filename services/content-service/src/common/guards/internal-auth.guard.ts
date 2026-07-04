import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration.js';

// Gates service-to-service routes under /internal/*. Header name matches what
// every existing internal HTTP client in the platform sends (ContentClient,
// OrganizationClient, http-content-client, ...): 'x-internal-token'.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-internal-token'] as string | undefined;
    const expected = this.config.get<AppConfig['internalServiceToken']>('internalServiceToken');

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing x-internal-token');
    }
    return true;
  }
}
