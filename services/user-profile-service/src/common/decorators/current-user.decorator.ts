import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../infrastructure/auth/jwt-verifier.service.js';

// Extracts the authenticated user set on the request by JwtAuthGuard.
// Usage: @CurrentUser() user: JwtPayload
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
