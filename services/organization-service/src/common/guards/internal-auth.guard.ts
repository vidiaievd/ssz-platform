import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/configuration.js';

// Gates service-to-service routes under /internal/*. Header name matches what
// every existing internal HTTP client in the platform sends (OrganizationClient,
// http-content-client, ...): 'x-internal-token'.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-internal-token'] as string | undefined;
    const expected = this.config.get('INTERNAL_SERVICE_TOKEN', { infer: true });

    if (!expected || !token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing x-internal-token');
    }
    return true;
  }
}
