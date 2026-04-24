/**
 * Content visibility levels (Content Service).
 * Determines who can discover and read a content item.
 */
export const Visibility = {
  PUBLIC: 'PUBLIC',
  SCHOOL_PRIVATE: 'SCHOOL_PRIVATE',
  SHARED: 'SHARED',
  PRIVATE: 'PRIVATE',
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];
