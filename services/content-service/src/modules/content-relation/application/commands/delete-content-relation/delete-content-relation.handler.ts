import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { DeleteContentRelationCommand } from './delete-content-relation.command.js';
import {
  CONTENT_RELATION_REPOSITORY,
  type IContentRelationRepository,
} from '../../../domain/repositories/content-relation.repository.interface.js';

@CommandHandler(DeleteContentRelationCommand)
export class DeleteContentRelationHandler
  implements ICommandHandler<DeleteContentRelationCommand, void>
{
  constructor(
    @Inject(CONTENT_RELATION_REPOSITORY) private readonly repo: IContentRelationRepository,
  ) {}

  async execute(command: DeleteContentRelationCommand): Promise<void> {
    const relation = await this.repo.findById(command.id);
    if (!relation) throw new NotFoundException(`ContentRelation ${command.id} not found`);

    await this.repo.delete(command.id);
  }
}
