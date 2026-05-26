import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTutoringGroupCommand } from './create-tutoring-group.command.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { TutoringGroup } from '../../../domain/entities/tutoring-group.entity.js';
import { TutoringGroupAlreadyExistsException } from '../../../domain/exceptions/tutoring-group-already-exists.exception.js';

@CommandHandler(CreateTutoringGroupCommand)
export class CreateTutoringGroupHandler implements ICommandHandler<CreateTutoringGroupCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: CreateTutoringGroupCommand): Promise<{ id: string }> {
    const existing = await this.groupRepository.findByTutorId(command.actorId);
    if (existing) {
      throw new TutoringGroupAlreadyExistsException(command.actorId);
    }

    const group = TutoringGroup.create(
      {
        id: randomUUID(),
        tutorId: command.actorId,
        name: command.name,
        description: command.description,
        avatarUrl: command.avatarUrl,
      },
      randomUUID(),
    );

    await this.groupRepository.save(group);

    for (const event of group.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }

    return { id: group.id };
  }
}
