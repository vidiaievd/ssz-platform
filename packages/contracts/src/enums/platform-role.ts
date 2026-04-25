/**
 * Platform-level roles assigned by the Auth Service.
 * String values match the role names stored in auth_db.roles.name.
 */
export const PlatformRole = {
  PLATFORM_ADMIN: 'platform_admin',
  MANAGER_PLATFORM: 'manager_platform',
  TUTOR: 'tutor',
  STUDENT: 'student',
  PREMIUM: 'premium',
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];
