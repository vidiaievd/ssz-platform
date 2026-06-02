export const SchoolType = {
  ONLINE: 'ONLINE',
  HYBRID: 'HYBRID',
} as const;

export type SchoolType = (typeof SchoolType)[keyof typeof SchoolType];
