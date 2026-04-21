import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessibleEntity } from '../../domain/types/accessible-entity.js';

/** Reads the entity attached to the request by VisibilityGuard. */
export const AccessEntity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessibleEntity => {
    const request = ctx.switchToHttp().getRequest<Request & { accessEntity: AccessibleEntity }>();
    return request.accessEntity;
  },
);
