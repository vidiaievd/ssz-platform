import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteTutoringGroupCommand } from './delete-tutoring-group.command.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';

@CommandHandler(DeleteTutoringGroupCommand)
export class DeleteTutoringGroupHandler implements ICommandHandler<DeleteTutoringGroupCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
  ) {}

  async execute(command: DeleteTutoringGroupCommand): Promise<void> {
    const group = await this.groupRepository.findByTutorId(command.actorId);
    if (!group) throw new TutoringGroupNotFoundException(command.actorId);

    group.softDelete(command.actorId); // throws ForbiddenOperationException if not tutor

    await this.groupRepository.save(group);
  }
}
