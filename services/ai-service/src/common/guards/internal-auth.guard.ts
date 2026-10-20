import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Gates service-to-service routes. Header name matches what every internal HTTP client in
 * the platform sends: `x-internal-token` (learning-service is the one exception and is not
 * a caller here).
 *
 * Agents in plans 79–82 are reached by other services as well as by users, and an internal
 * call spends a payer's credits — not something to leave to the network.
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
