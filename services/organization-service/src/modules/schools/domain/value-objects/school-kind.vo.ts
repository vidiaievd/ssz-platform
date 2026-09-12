/**
 * What a workspace row is. SCHOOL is an organisation with staff and public presence;
 * SOLO is one private tutor's own space, built on the same tables so that assignments,
 * review and analytics work for a tutor without a second authorisation model
 * (plan 59, variant B). A SOLO workspace is never public and is never called a school
 * in anything the user can see.
 */
export const SchoolKind = {
  SCHOOL: 'SCHOOL',
  SOLO: 'SOLO',
} as const;

export type SchoolKind = (typeof SchoolKind)[keyof typeof SchoolKind];
