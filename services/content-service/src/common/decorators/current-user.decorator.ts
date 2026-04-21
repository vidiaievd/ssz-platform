import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../infrastructure/auth/jwt-verifier.service.js';

// Extracts the verified JWT payload attached to the request by JwtAuthGuard.
// Usage: @CurrentUser() user: AuthenticatedUser
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
