import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Mark a route as public — bypasses the global JwtAuthGuard.
// Usage: @Public() on a controller method or controller class.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
