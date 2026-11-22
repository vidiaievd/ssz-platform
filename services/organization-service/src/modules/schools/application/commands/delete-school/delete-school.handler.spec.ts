import { jest } from '@jest/globals';
import { DeleteSchoolHandler } from './delete-school.handler.js';
import { DeleteSchoolCommand } from './delete-school.command.js';
import { ChangeSchoolStatusCommand } from '../../../../school-lifecycle/application/commands/change-school-status.command.js';
import { SoloWorkspaceNotDeletableException } from '../../../domain/exceptions/solo-workspace-not-deletable.exception.js';

const OWNER = 'owner-1';

function setup(school: unknown) {
  const commandBus = { execute: jest.fn<(c: unknown) => Promise<void>>().mockResolvedValue(undefined) };
  const schoolRepository = { findById: jest.fn<() => Promise<unknown>>().mockResolvedValue(school) };
  const handler = new DeleteSchoolHandler(commandBus as never, schoolRepository as never);
  return { handler, commandBus };
}

describe('DeleteSchoolHandler', () => {
  it("archives the owner's school through the lifecycle", async () => {
    const { handler, commandBus } = setup({ id: 's-1', isSolo: false, ownerId: OWNER });

    await handler.execute(new DeleteSchoolCommand(OWNER, 's-1'));

    const sent = commandBus.execute.mock.calls[0][0] as ChangeSchoolStatusCommand;
    expect(sent).toBeInstanceOf(ChangeSchoolStatusCommand);
    expect(sent).toMatchObject({ schoolId: 's-1', transition: 'close' });
  });

  it("refuses the owner's solo workspace and changes nothing", async () => {
    const { handler, commandBus } = setup({ id: 'ws-1', isSolo: true, ownerId: OWNER });

    await expect(handler.execute(new DeleteSchoolCommand(OWNER, 'ws-1'))).rejects.toBeInstanceOf(
      SoloWorkspaceNotDeletableException,
    );
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it("leaves someone else's solo workspace to the lifecycle's own refusal", async () => {
    const { handler, commandBus } = setup({ id: 'ws-1', isSolo: true, ownerId: 'someone-else' });

    await handler.execute(new DeleteSchoolCommand('intruder', 'ws-1'));

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });
});
