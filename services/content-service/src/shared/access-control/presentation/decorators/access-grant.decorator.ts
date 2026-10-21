import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessDecision } from '../../domain/types/access-decision.js';

/** Reads the decision VisibilityGuard reached for this request (see `isStaffGrant`). */
export const AccessGrant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessDecision => {
    const request = ctx.switchToHttp().getRequest<Request & { accessDecision: AccessDecision }>();
    return request.accessDecision;
  },
);
