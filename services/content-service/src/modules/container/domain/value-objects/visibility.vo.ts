export enum Visibility {
  PUBLIC = 'public',
  SCHOOL_PRIVATE = 'school_private',
  SHARED = 'shared',
  PRIVATE = 'private',
}

export function getValidVisibilities(hasSchool: boolean): Visibility[] {
  if (hasSchool) {
    return [Visibility.PUBLIC, Visibility.SCHOOL_PRIVATE, Visibility.SHARED, Visibility.PRIVATE];
  }
  return [Visibility.PUBLIC, Visibility.SHARED, Visibility.PRIVATE];
}
