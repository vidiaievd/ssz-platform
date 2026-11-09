/**
 * Level of a platform admin, carried as the `admin_level` claim — only in tokens of the
 * admin-panel client (`clientType: admin`), never in a web or mobile session of the same person.
 *
 * Levels nest strictly: support < admin < super. A route declares the lowest level it admits,
 * and every higher level passes too (plan 90, §2).
 */
export const AdminLevel = {
  SUPPORT: 'support',
  ADMIN: 'admin',
  SUPER: 'super',
} as const;

export type AdminLevel = (typeof AdminLevel)[keyof typeof AdminLevel];

/** Ascending order — the index is the rank. */
export const ADMIN_LEVELS: readonly AdminLevel[] = [AdminLevel.SUPPORT, AdminLevel.ADMIN, AdminLevel.SUPER];

/** The claim value as a level, or null for anything else (absent, unknown, wrong type). */
export function parseAdminLevel(value: unknown): AdminLevel | null {
  return typeof value === 'string' && (ADMIN_LEVELS as readonly string[]).includes(value)
    ? (value as AdminLevel)
    : null;
}

/**
 * True when `actual` is `required` or higher. A missing or unknown `actual` never passes;
 * an unknown `required` is treated as unreachable, so a typo in a route closes it instead of opening it.
 */
export function adminLevelAtLeast(actual: unknown, required: AdminLevel): boolean {
  const have = parseAdminLevel(actual);
  if (have === null) return false;
  const need = ADMIN_LEVELS.indexOf(required);
  if (need < 0) return false;
  return ADMIN_LEVELS.indexOf(have) >= need;
}
