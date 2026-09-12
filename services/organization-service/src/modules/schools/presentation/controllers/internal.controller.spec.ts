import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller.js';

const SCHOOL_ID = '11111111-0000-4000-8000-000000000001';
const OWNER_ID = '22222222-0000-4000-8000-000000000002';
const TEACHER_ID = '33333333-0000-4000-8000-000000000003';
const STRANGER_ID = '44444444-0000-4000-8000-000000000004';

function makeController(school: { ownerId: string; members: Array<{ userId: string; role: string }> }) {
  const queryBus = { execute: jest.fn<() => Promise<unknown>>().mockResolvedValue(school) };
  return new InternalController(queryBus as never, {} as never);
}

const SCHOOL = {
  ownerId: OWNER_ID,
  members: [{ userId: TEACHER_ID, role: 'TEACHER' }],
};

describe('InternalController.getMemberRole', () => {
  it('answers with the role written on the roster', async () => {
    const controller = makeController(SCHOOL);

    await expect(controller.getMemberRole(SCHOOL_ID, TEACHER_ID)).resolves.toMatchObject({
      role: 'TEACHER',
    });
  });

  // Creating a school writes no roster row for its owner: ownership lives in
  // `schools.ownerId`. Reading only the roster answered "not a member" about the one
  // person who answers for the school — live, an owner was refused permission to assign
  // homework to their own group.
  it('answers OWNER for the owner, who is not on the roster', async () => {
    const controller = makeController(SCHOOL);

    await expect(controller.getMemberRole(SCHOOL_ID, OWNER_ID)).resolves.toMatchObject({
      role: 'OWNER',
    });
  });

  // An owner who also sits on the roster keeps whatever was written there; nothing here
  // silently promotes them.
  it('lets a roster row win over ownership', async () => {
    const controller = makeController({
      ownerId: OWNER_ID,
      members: [{ userId: OWNER_ID, role: 'CONTENT_ADMIN' }],
    });

    await expect(controller.getMemberRole(SCHOOL_ID, OWNER_ID)).resolves.toMatchObject({
      role: 'CONTENT_ADMIN',
    });
  });

  it('still refuses somebody who is neither', async () => {
    const controller = makeController(SCHOOL);

    await expect(controller.getMemberRole(SCHOOL_ID, STRANGER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
