import { jest } from '@jest/globals';
import { GetSchoolHandler } from './get-school.handler.js';
import { GetSchoolQuery } from './get-school.query.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import type { SchoolStatus } from '../../../domain/school-access.policy.js';

const closesAt = new Date('2026-12-10T00:00:00Z');
const purgeAt = new Date('2027-05-10T00:00:00Z');

function schoolIn(status: SchoolStatus): School {
  const now = new Date('2026-11-10T00:00:00Z');
  return School.rehydrate({
    id: 's-1',
    name: 'Nordick',
    slug: 'nordick',
    ownerId: 'owner-1',
    type: SchoolType.ONLINE,
    isActive: status === 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: status === 'closed' || status === 'purged' ? now : undefined,
    members: [
      SchoolMember.rehydrate({ id: 'm-1', schoolId: 's-1', userId: 'teacher-1', role: MemberRole.TEACHER, joinedAt: now }),
    ],
    requireTutorReviewForSelfPaced: false,
    lifecycle: {
      status,
      closesAt: status === 'suspended' ? closesAt : null,
      purgeAt: status === 'closed' ? purgeAt : null,
    },
  });
}

const read = (status: SchoolStatus, actorId: string) =>
  new GetSchoolHandler({ findById: jest.fn(async () => schoolIn(status)) } as never).execute(
    new GetSchoolQuery('s-1', actorId),
  );

describe('GetSchoolHandler — lifecycle (plan 90, phase 5, step 3)', () => {
  it('a suspended school is still its members\' to read, with the date it closes', async () => {
    await expect(read('suspended', 'teacher-1')).resolves.toMatchObject({ status: 'suspended', closesAt, purgeAt: null });
  });

  it('a closed school is its owner\'s alone, with the purge date', async () => {
    await expect(read('closed', 'owner-1')).resolves.toMatchObject({ status: 'closed', purgeAt });
    await expect(read('closed', 'teacher-1')).rejects.toBeInstanceOf(SchoolNotFoundException);
  });

  it('a purged school is nobody\'s', async () => {
    await expect(read('purged', 'owner-1')).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});
