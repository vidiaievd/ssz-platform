import { School } from './school.entity.js';
import { SchoolMember } from './school-member.entity.js';
import { MemberRole } from '../value-objects/member-role.vo.js';

const member = (userId: string, role = MemberRole.STUDENT) =>
  SchoolMember.create({ id: `id-${userId}`, schoolId: 's-1', userId, role, joinedAt: new Date() });

function loaded(...userIds: string[]): School {
  const school = School.create({ id: 's-1', name: 'S', slug: 's', ownerId: 'owner-1' }, 'evt-0');
  return School.rehydrate({ ...snapshot(school), members: userIds.map((u) => member(u)) });
}

/** The props a repository would read back for `school`. */
function snapshot(school: School) {
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    ownerId: school.ownerId,
    type: school.type,
    kind: school.kind,
    isActive: school.isActive,
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
  } as unknown as Parameters<typeof School.rehydrate>[0];
}

describe('School roster changes (what the repository writes)', () => {
  it('a loaded roster carries no changes', () => {
    const school = loaded('a', 'b');
    expect(school.addedMembers).toEqual([]);
    expect(school.removedMemberUserIds).toEqual([]);
  });

  it('records additions and removals made through the instance only', () => {
    const school = loaded('a', 'b');
    school.addMember(member('c'), 'owner-1', 'e1');
    school.removeMember('a', 'owner-1', 'e2');

    expect(school.addedMembers.map((m) => m.userId)).toEqual(['c']);
    expect(school.removedMemberUserIds).toEqual(['a']);
  });

  it('added then removed nets out, and so does removed then added back', () => {
    const school = loaded('a');
    school.addMember(member('c'), 'owner-1', 'e1');
    school.removeMember('c', 'owner-1', 'e2');
    school.removeMember('a', 'owner-1', 'e3');
    school.addMember(member('a'), 'owner-1', 'e4');

    expect(school.addedMembers).toEqual([]);
    expect(school.removedMemberUserIds).toEqual([]);
  });
});
