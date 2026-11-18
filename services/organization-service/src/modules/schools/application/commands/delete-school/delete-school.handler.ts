import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { DeleteSchoolCommand } from './delete-school.command.js';
import { ChangeSchoolStatusCommand } from '../../../../school-lifecycle/application/commands/change-school-status.command.js';

/**
 * The owner's "delete school" archives it (plan 90, phase 5): `closed`, purged after the archive term,
 * brought back only by a platform `super`. `school.closed` goes out with `by: 'owner'`; no admin trail.
 */
@CommandHandler(DeleteSchoolCommand)
export class DeleteSchoolHandler implements ICommandHandler<DeleteSchoolCommand> {
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: DeleteSchoolCommand): Promise<void> {
    // Not the owner → ForbiddenOperationException (403); already closed → 409.
    await this.commandBus.execute(
      new ChangeSchoolStatusCommand(command.schoolId, 'close', { kind: 'owner', userId: command.actorId }, null),
    );
  }
}
