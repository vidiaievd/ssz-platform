import { SetMetadata } from '@nestjs/common';
import type { AdminLevel } from '@ssz/contracts';

export const ADMIN_LEVEL_KEY = 'requiredAdminLevel';

/**
 * Lowest admin level a route admits (support < admin < super, plan 90 §2); higher levels pass too.
 * On a controller it sets the default for its routes, on a handler it overrides that default.
 * A route under AdminLevelGuard with no level at all admits `super` only.
 */
export const RequireAdminLevel = (level: AdminLevel) => SetMetadata(ADMIN_LEVEL_KEY, level);
