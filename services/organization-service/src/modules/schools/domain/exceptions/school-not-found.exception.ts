export class SchoolNotFoundException extends Error {
  constructor(id: string) {
    super(`School not found: ${id}`);
    this.name = 'SchoolNotFoundException';
  }
}
