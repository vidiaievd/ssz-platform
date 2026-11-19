import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { DeleteSchoolCommand } from './delete-school.command.js';
import { ChangeSchoolStatusCommand } from '../../../../school-lifecycle/application/commands/change-school-status.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import { SoloWorkspaceNotDeletableException } from '../../../domain/exceptions/solo-workspace-not-deletable.exception.js';

/**
 * The owner's "delete school" archives it (plan 90, phase 5): `closed`, purged after the archive term,
 * brought back only by a platform `super`. `school.closed` goes out with `by: 'owner'`; no admin trail.
 * Every service reacts to that event exactly as to an admin's close.
 *
 * A tutor's solo workspace is refused (plan 90, live check, block 9): it is their only one, and while
 * it is archived no new one opens.
 */
@CommandHandler(DeleteSchoolCommand)
export class DeleteSchoolHandler implements ICommandHandler<DeleteSchoolCommand> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
  ) {}

  async execute(command: DeleteSchoolCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    // Only the owner learns that it is a solo workspace; anyone else gets the lifecycle's 403 / 404.
    if (school && school.isSolo && school.ownerId === command.actorId) {
      throw new SoloWorkspaceNotDeletableException(command.schoolId);
    }

    // Not the owner → ForbiddenOperationException (403); already closed → 409.
    await this.commandBus.execute(
      new ChangeSchoolStatusCommand(command.schoolId, 'close', { kind: 'owner', userId: command.actorId }, null),
    );
  }
}
