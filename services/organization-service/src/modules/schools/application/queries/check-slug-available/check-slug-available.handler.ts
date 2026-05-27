import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { CheckSlugAvailableQuery } from './check-slug-available.query.js';

export interface SlugAvailabilityResult {
  available: boolean;
  suggestions?: string[];
}

@QueryHandler(CheckSlugAvailableQuery)
export class CheckSlugAvailableHandler implements IQueryHandler<CheckSlugAvailableQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(query: CheckSlugAvailableQuery): Promise<SlugAvailabilityResult> {
    const existing = await this.schoolRepository.findBySlug(query.slug);
    if (!existing) {
      return { available: true };
    }

    const suggestions = await this.generateSuggestions(query.slug);
    return { available: false, suggestions };
  }

  private async generateSuggestions(base: string): Promise<string[]> {
    const results: string[] = [];
    for (let i = 2; results.length < 3 && i <= 10; i++) {
      const candidate = `${base}-${i}`;
      const taken = await this.schoolRepository.findBySlug(candidate);
      if (!taken) results.push(candidate);
    }
    return results;
  }
}
