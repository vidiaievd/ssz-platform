import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RemoveStudentCommand } from './remove-student.command.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';

@CommandHandler(RemoveStudentCommand)
export class RemoveStudentHandler implements ICommandHandler<RemoveStudentCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: RemoveStudentCommand): Promise<void> {
    // Actor may be the tutor (removing a student) or the student themselves (leaving)
    const group =
      (await this.groupRepository.findByTutorId(command.actorId)) ??
      (await this.groupRepository.findByStudentId(command.actorId));

    if (!group) throw new TutoringGroupNotFoundException(command.actorId);

    group.removeStudent(command.userId, command.actorId, randomUUID());

    await this.groupRepository.save(group);

    for (const event of group.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
  }
}
