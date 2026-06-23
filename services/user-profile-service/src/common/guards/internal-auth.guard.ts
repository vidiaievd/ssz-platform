import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/configuration.js';

// Protects /internal/* routes called by other services (no user JWT available there).
// Pair with @Public() on the route to bypass the global JwtAuthGuard.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-service-token'];
    const expected = this.config.get('INTERNAL_SERVICE_TOKEN');

    if (!expected || token !== expected) {
      throw new UnauthorizedException('Invalid or missing x-service-token');
    }
    return true;
  }
}
