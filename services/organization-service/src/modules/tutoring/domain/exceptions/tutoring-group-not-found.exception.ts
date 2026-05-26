export class TutoringGroupNotFoundException extends Error {
  constructor(id: string) {
    super(`Tutoring group not found: ${id}`);
    this.name = 'TutoringGroupNotFoundException';
  }
}
