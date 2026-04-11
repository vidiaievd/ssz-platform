export class SchoolAlreadyExistsException extends Error {
  constructor(name: string) {
    super(`School already exists: ${name}`);
    this.name = 'SchoolAlreadyExistsException';
  }
}
