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
});
