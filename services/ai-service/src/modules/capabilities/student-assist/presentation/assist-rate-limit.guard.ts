import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { ASSIST_RATE_LIMITER, type IAssistRateLimiter } from '../application/ports/assist-rate-limiter.js';

/** 429 with `Retry-After` (seconds) once the learner has sent the window's messages (`ai:assist:rl:<userId>`). */
@Injectable()
export class AssistRateLimitGuard implements CanActivate {
  constructor(@Inject(ASSIST_RATE_LIMITER) private readonly limiter: IAssistRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const user = http.getRequest<{ user: AuthenticatedUser }>().user;
    const decision = await this.limiter.take(user.userId);
    if (decision.allowed) return true;

    const retryAfter = Math.max(Math.ceil(decision.retryAfterMs / 1000), 1);
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, error: 'Too Many Requests', message: 'Too many messages to the assistant', retryAfter },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
