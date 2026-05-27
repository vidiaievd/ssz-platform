import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateSchoolCommand } from './create-school.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolAlreadyExistsException } from '../../../domain/exceptions/school-already-exists.exception.js';
import { SchoolSlugAlreadyExistsException } from '../../../domain/exceptions/school-slug-already-exists.exception.js';
import type { SchoolDto } from '../../dto/school.dto.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 57);
}

@CommandHandler(CreateSchoolCommand)
export class CreateSchoolHandler implements ICommandHandler<CreateSchoolCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CreateSchoolCommand): Promise<SchoolDto> {
    const existing = await this.schoolRepository.findByName(command.name);
    if (existing) {
      throw new SchoolAlreadyExistsException(command.name);
    }

    const slug = await this.resolveSlug(command.slug, command.name);

    const school = School.create(
      {
        id: randomUUID(),
        name: command.name,
        slug,
        ownerId: command.actorId,
        description: command.description,
        avatarUrl: command.avatarUrl,
        website: command.website,
        contactEmail: command.contactEmail,
        city: command.city,
      },
      randomUUID(),
    );

    await this.schoolRepository.save(school);

    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }

    return {
      id: school.id,
      name: school.name,
      slug: school.slug,
      description: school.description,
      ownerId: school.ownerId,
      avatarUrl: school.avatarUrl,
      website: school.website,
      contactEmail: school.contactEmail,
      city: school.city,
      isActive: school.isActive,
      requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
      defaultExplanationLanguage: school.defaultExplanationLanguage,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      members: [],
    };
  }

  private async resolveSlug(provided: string | undefined, name: string): Promise<string> {
    if (provided) {
      const taken = await this.schoolRepository.findBySlug(provided);
      if (taken) throw new SchoolSlugAlreadyExistsException(provided);
      return provided;
    }

    const base = slugify(name);
    const taken = await this.schoolRepository.findBySlug(base);
    if (!taken) return base;

    for (let i = 2; i <= 99; i++) {
      const candidate = `${base}-${i}`;
      const exists = await this.schoolRepository.findBySlug(candidate);
      if (!exists) return candidate;
    }

    return `${base}-${Date.now()}`;
  }
}
