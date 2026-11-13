import { jest } from '@jest/globals';
import { SchoolPrismaRepository } from './school.prisma.repository.js';
import { School } from '../../domain/entities/school.entity.js';
import { SchoolMember } from '../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';

function txMock() {
  return {
    school: { upsert: jest.fn() },
    schoolMember: { upsert: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  };
}

function repoWith(tx: ReturnType<typeof txMock>) {
  const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => Promise<void>) => fn(tx)) };
  return new SchoolPrismaRepository(prisma as never);
}

const member = (userId: string) =>
  SchoolMember.create({ id: `id-${userId}`, schoolId: 's-1', userId, role: MemberRole.STUDENT, joinedAt: new Date() });

describe('SchoolPrismaRepository.save — roster writes', () => {
  /**
   * A stale aggregate (read before another request added someone) must not delete that
   * someone, nor rewrite members it merely carries.
   */
  it('writes only the members added through the aggregate and deletes nobody else', async () => {
    const tx = txMock();
    const school = School.create({ id: 's-1', name: 'S', slug: 's', ownerId: 'owner-1' }, 'e0');
    school.addMember(member('a'), 'owner-1', 'e1');

    await repoWith(tx).save(school);

    expect(tx.schoolMember.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: 'id-a', userId: 'a', role: MemberRole.STUDENT })],
      skipDuplicates: true,
    });
    expect(tx.schoolMember.deleteMany).not.toHaveBeenCalled();
    expect(tx.schoolMember.upsert).not.toHaveBeenCalled();
  });

  it('deletes exactly the members removed through the aggregate', async () => {
    const tx = txMock();
    const school = School.create({ id: 's-1', name: 'S', slug: 's', ownerId: 'owner-1' }, 'e0');
    school.addMember(member('a'), 'owner-1', 'e1');
    school.addMember(member('b'), 'owner-1', 'e2');
    await repoWith(txMock()).save(school);
    // A fresh read of the stored roster.
    const reread = School.rehydrate({
      id: school.id, name: school.name, slug: school.slug, ownerId: school.ownerId,
      type: school.type, kind: school.kind, isActive: school.isActive,
      createdAt: school.createdAt, updatedAt: school.updatedAt,
      members: school.members,
    } as never);
    reread.removeMember('a', 'owner-1', 'e3');

    await repoWith(tx).save(reread);

    expect(tx.schoolMember.createMany).not.toHaveBeenCalled();
    expect(tx.schoolMember.deleteMany).toHaveBeenCalledWith({ where: { schoolId: 's-1', userId: { in: ['a'] } } });
  });

  it('a save without roster changes touches no member row', async () => {
    const tx = txMock();
    const school = School.create({ id: 's-1', name: 'S', slug: 's', ownerId: 'owner-1' }, 'e0');

    await repoWith(tx).save(school);

    expect(tx.school.upsert).toHaveBeenCalled();
    expect(tx.schoolMember.createMany).not.toHaveBeenCalled();
    expect(tx.schoolMember.deleteMany).not.toHaveBeenCalled();
  });
});
