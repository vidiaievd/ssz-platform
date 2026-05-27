export class SchoolSlugAlreadyExistsException extends Error {
  constructor(slug: string) {
    super(`School slug already taken: ${slug}`);
    this.name = 'SchoolSlugAlreadyExistsException';
  }
}
