import { jest } from '@jest/globals';
import { ProvisionSoloWorkspaceHandler } from './provision-solo-workspace.handler.js';
import { ProvisionSoloWorkspaceCommand } from './provision-solo-workspace.command.js';
import { SchoolGroup } from '../../../domain/entities/school-group.entity.js';

const TUTOR_ID = 'tutor-1';

function setup(owned: unknown[] = [], groups: unknown[] = []) {
  const schoolRepository = {
    findByOwnerId: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(owned),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const groupRepository = {
    findBySchoolId: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(groups),
    save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const groupTeachers = { save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };
  const eventPublisher = {
    publish: jest
      .fn<(event: { eventType: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  const handler = new ProvisionSoloWorkspaceHandler(
    schoolRepository as never,
    groupRepository as never,
    groupTeachers as never,
    eventPublisher as never,
  );

  const published = () => eventPublisher.publish.mock.calls.map(([event]) => event.eventType);

  return { handler, schoolRepository, groupRepository, groupTeachers, eventPublisher, published };
}

describe('ProvisionSoloWorkspaceHandler', () => {
  it('creates the workspace and announces both the school and its group', async () => {
    const { handler, schoolRepository, groupTeachers, published } = setup();

    const result = await handler.execute(
      new ProvisionSoloWorkspaceCommand(TUTOR_ID, 'Norsk med Dmytro'),
    );

    expect(result.created).toBe(true);
    expect(schoolRepository.save).toHaveBeenCalled();
    expect(groupTeachers.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TUTOR_ID, role: 'primary' }),
    );
    // The group opens without `publish-school-group`, so this handler owes the event
    // that puts it in the analytics projections (plan 59 §1.1 F).
    expect(published()).toEqual(
      expect.arrayContaining(['school.created', 'school.group.published']),
    );
  });

  it('changes nothing and announces nothing when the tutor already has a workspace', async () => {
    const existingSchool = { id: 'ws-1', isSolo: true, isDeleted: false };
    const existingGroup = SchoolGroup.create({
      id: 'group-1',
      schoolId: 'ws-1',
      name: 'Norsk med Dmytro',
      mode: 'online',
    });
    existingGroup.openAsSoloDefault();

    const { handler, schoolRepository, groupRepository, published } = setup(
      [existingSchool],
      [existingGroup],
    );

    const result = await handler.execute(new ProvisionSoloWorkspaceCommand(TUTOR_ID));

    expect(result).toEqual({ schoolId: 'ws-1', groupId: 'group-1', created: false });
    expect(schoolRepository.save).not.toHaveBeenCalled();
    expect(groupRepository.save).not.toHaveBeenCalled();
    expect(published()).toEqual([]);
  });

  // A tutor may now have groups of their own beside the workspace's one (plan 59 §5), so
  // "the default group" can no longer mean "whichever row came back first". A workspace
  // provisioned before the flag existed has its oldest group adopted — it is the group
  // that has always held everybody.
  it('adopts the oldest group of a workspace provisioned before the flag existed', async () => {
    const existingSchool = { id: 'ws-1', isSolo: true, isDeleted: false };
    const unflagged = SchoolGroup.create({
      id: 'group-1',
      schoolId: 'ws-1',
      name: 'My students',
      mode: 'online',
    });
    const tutorsOwn = SchoolGroup.create({
      id: 'group-2',
      schoolId: 'ws-1',
      name: 'Tuesday 19:00',
      mode: 'online',
    });

    const { handler, groupRepository } = setup([existingSchool], [unflagged, tutorsOwn]);

    const result = await handler.execute(new ProvisionSoloWorkspaceCommand(TUTOR_ID));

    expect(result.groupId).toBe('group-1');
    expect(unflagged.isDefault).toBe(true);
    expect(groupRepository.save).toHaveBeenCalledTimes(1);
  });

  it('keeps the flagged group even when another one is older in the list', async () => {
    const existingSchool = { id: 'ws-1', isSolo: true, isDeleted: false };
    const tutorsOwn = SchoolGroup.create({
      id: 'group-2',
      schoolId: 'ws-1',
      name: 'Tuesday 19:00',
      mode: 'online',
    });
    const theDefault = SchoolGroup.create({
      id: 'group-1',
      schoolId: 'ws-1',
      name: 'My students',
      mode: 'online',
    });
    theDefault.openAsSoloDefault();

    const { handler, groupRepository } = setup([existingSchool], [tutorsOwn, theDefault]);

    const result = await handler.execute(new ProvisionSoloWorkspaceCommand(TUTOR_ID));

    expect(result.groupId).toBe('group-1');
    expect(groupRepository.save).not.toHaveBeenCalled();
  });
});
