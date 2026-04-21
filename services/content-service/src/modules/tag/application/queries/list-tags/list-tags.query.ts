import type { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import type { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';

export class ListTagsQuery {
  constructor(
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly scope?: TagScope,
    public readonly category?: TagCategory,
    public readonly schoolId?: string,
    public readonly search?: string,
    public readonly page: number = 1,
    public readonly limit: number = 20,
  ) {}
}
