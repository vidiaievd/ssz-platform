import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateTutoringGroupCommand } from './update-tutoring-group.command.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';

@CommandHandler(UpdateTutoringGroupCommand)
export class UpdateTutoringGroupHandler implements ICommandHandler<UpdateTutoringGroupCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
  ) {}

  async execute(command: UpdateTutoringGroupCommand): Promise<void> {
    const group = await this.groupRepository.findByTutorId(command.actorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(command.actorId);

    group.update({
      name: command.name,
      description: command.description,
      avatarUrl: command.avatarUrl,
    });

    await this.groupRepository.save(group);
  }
}
