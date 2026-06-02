import type { SchoolType } from '../../../domain/value-objects/school-type.vo.js';

export class CreateSchoolCommand {
  constructor(
    public readonly actorId: string,
    public readonly name: string,
    public readonly slug?: string,
    public readonly description?: string,
    public readonly avatarUrl?: string,
    public readonly website?: string,
    public readonly contactEmail?: string,
    public readonly city?: string,
    public readonly type?: SchoolType,
  ) {}
}
