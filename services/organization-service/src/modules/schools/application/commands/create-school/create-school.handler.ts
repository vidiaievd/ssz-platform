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

@CommandHandler(CreateSchoolCommand)
export class CreateSchoolHandler implements ICommandHandler<CreateSchoolCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CreateSchoolCommand): Promise<{ id: string }> {
    const existing = await this.schoolRepository.findByName(command.name);
    if (existing) {
      throw new SchoolAlreadyExistsException(command.name);
    }

    const school = School.create(
      {
        id: randomUUID(),
        name: command.name,
        ownerId: command.actorId,
        description: command.description,
        avatarUrl: command.avatarUrl,
      },
      randomUUID(),
    );

    await this.schoolRepository.save(school);

    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }

    return { id: school.id };
  }
}
