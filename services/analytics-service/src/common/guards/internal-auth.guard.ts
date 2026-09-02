import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Gates service-to-service routes. Header name matches what every internal HTTP client in
 * the platform already sends: `x-internal-token`.
 *
 * The mastery profile is the first route here that answers about *one named learner*, which
 * is why it is guarded at all where `internal/events` is merely `@Public()` and left to the
 * network: a replay of event envelopes is a firehose nobody can aim, a profile is a question
 * about a person.
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
