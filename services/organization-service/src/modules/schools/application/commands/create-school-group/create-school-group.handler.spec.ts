import { jest } from '@jest/globals';
import { CreateSchoolGroupHandler } from './create-school-group.handler.js';
import { CreateSchoolGroupCommand } from './create-school-group.command.js';
import { SchoolGroup } from '../../../domain/entities/school-group.entity.js';

const TUTOR_ID = 'tutor-1';
const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

function setup(school: Record<string, unknown>) {
  const schoolRepository = {
    findById: jest.fn<() => Promise<unknown>>().mockResolvedValue(school),
  };
  const saved: SchoolGroup[] = [];
  const groupRepository = {
    save: jest.fn<(g: SchoolGroup) => Promise<void>>().mockImplementation(async (g) => {
      saved.push(g);
    }),
  };
  const groupTeachers = { save: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };
  const eventPublisher = {
    publish: jest
      .fn<(event: { eventType: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
  };

  const handler = new CreateSchoolGroupHandler(
    schoolRepository as never,
    groupRepository as never,
    groupTeachers as never,
    eventPublisher as never,
  );

  const published = () => eventPublisher.publish.mock.calls.map(([event]) => event.eventType);

  return { handler, groupRepository, groupTeachers, published, saved };
}

const soloWorkspace = {
  id: SCHOOL_ID,
  ownerId: TUTOR_ID,
  isSolo: true,
  getMemberRole: () => undefined,
};

const school = {
  id: SCHOOL_ID,
  ownerId: 'head-1',
  isSolo: false,
  getMemberRole: () => undefined,
};

describe('CreateSchoolGroupHandler', () => {
  // A tutor is both the person who drafts the group and the person who teaches it. Left
  // in draft with nobody on it, their group reaches neither the analytics projections nor
  // the queue their own marking comes through (plan 59 §5).
  it('opens a solo tutor’s group with them on it', async () => {
    const { handler, groupTeachers, published, saved } = setup(soloWorkspace);

    await handler.execute(
      new CreateSchoolGroupCommand(TUTOR_ID, SCHOOL_ID, 'Tuesday 19:00'),
    );

    expect(saved.at(-1)?.status).toBe('active');
    // Beside the workspace's own group, not instead of it.
    expect(saved.at(-1)?.isDefault).toBe(false);
    expect(groupTeachers.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TUTOR_ID, role: 'primary' }),
    );
    expect(published()).toEqual(['school.group.published']);
  });

  // A school group is drafted by one person and taught by another: it waits for the
  // publishing checklist, and whoever created it is not thereby its teacher.
  it('leaves a school’s group in draft with nobody assigned', async () => {
    const { handler, groupTeachers, published, saved } = setup({
      ...school,
      getMemberRole: () => 'ADMIN',
    });

    await handler.execute(new CreateSchoolGroupCommand('admin-1', SCHOOL_ID, 'A2 evening'));

    expect(saved.at(-1)?.status).toBe('draft');
    expect(groupTeachers.save).not.toHaveBeenCalled();
    expect(published()).toEqual([]);
  });

  it('refuses somebody who neither owns nor administers the workspace', async () => {
    const { handler } = setup(school);

    await expect(
      handler.execute(new CreateSchoolGroupCommand('stranger-1', SCHOOL_ID, 'A2 evening')),
    ).rejects.toThrow();
  });
});
