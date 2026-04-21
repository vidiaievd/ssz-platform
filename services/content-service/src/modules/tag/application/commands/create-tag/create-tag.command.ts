import type { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';
import type { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';

export class CreateTagCommand {
  constructor(
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly name: string,
    public readonly category: TagCategory,
    public readonly scope: TagScope,
    public readonly ownerSchoolId?: string,
  ) {}
}
