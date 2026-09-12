import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Gates service-to-service routes. Header name matches what every internal HTTP client in
 * the platform already sends: `x-internal-token`.
 *
 * Needed here from plan 58: `delivered` is asked of this service rather than projected
 * into analytics, and the answer names one group's teaching plan — not something to leave
 * to the network the way a health check is.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-internal-token'] as string | undefined;
    const expected = this.config.get<string>('internalServiceToken');

    if (!expected || !token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing x-internal-token');
    }
    return true;
  }
}
