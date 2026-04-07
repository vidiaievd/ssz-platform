import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../guards/jwt-auth.guard';

/**
 * Extracts the authenticated user payload from the request object.
 * Populated by JwtAuthGuard after successful JWT verification.
 *
 * Usage: @CurrentUser() user: JwtPayload
 * Usage: @CurrentUser('sub') userId: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayload = request.user;
    return field ? user?.[field] : user;
  },
);
