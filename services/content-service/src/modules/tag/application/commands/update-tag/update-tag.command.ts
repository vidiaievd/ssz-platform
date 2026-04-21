import type { TagCategory } from '../../../domain/value-objects/tag-category.vo.js';

export class UpdateTagCommand {
  constructor(
    public readonly tagId: string,
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly name?: string,
    public readonly category?: TagCategory,
  ) {}
}
