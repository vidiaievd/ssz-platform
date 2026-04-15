import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Mark a route as public — JwtAuthGuard will skip token verification.
// Use on health checks, public catalog endpoints, etc.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
