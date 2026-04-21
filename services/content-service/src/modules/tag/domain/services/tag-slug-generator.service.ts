import { Injectable, Inject } from '@nestjs/common';
import slugify from 'slugify';
import { TagScope } from '../value-objects/tag-scope.vo.js';
import { TAG_REPOSITORY } from '../repositories/tag.repository.interface.js';
import type { ITagRepository } from '../repositories/tag.repository.interface.js';

@Injectable()
export class TagSlugGeneratorService {
  constructor(@Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository) {}

  async generate(name: string, scope: TagScope, ownerSchoolId: string | null): Promise<string> {
    const base = this.slugifyName(name);

    const existing = await this.tagRepo.countBySlugPrefix(base, scope, ownerSchoolId);
    if (existing === 0) return base;

    // Append numeric suffix: base-2, base-3, etc.
    return `${base}-${existing + 1}`;
  }

  private slugifyName(name: string): string {
    const result = slugify(name, {
      lower: true,
      strict: true, // removes non-alphanumeric chars
      locale: 'en',
      trim: true,
    });

    // Fallback for non-latin names that slugify can't convert.
    if (!result || result.length === 0) {
      return 'tag';
    }

    // Truncate to 75 chars to leave room for "-N" suffix.
    return result.slice(0, 75);
  }
}
