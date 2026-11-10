import { jest } from '@jest/globals';
import { UpdateStudentHandler } from './update-student.handler.js';
import { UpdateStudentCommand } from './update-student.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SeatsExhaustedException } from '../../../domain/exceptions/seats-exhausted.exception.js';
import type { SeatUsage } from '../../../domain/value-objects/seat-policy.vo.js';

function makeSchoolWithStudent(): School {
  const school = School.create({ id: 's-1', name: 'Test School', slug: 'test-school', ownerId: 'owner-1' }, 'evt-1');
  school.addMember(
    SchoolMember.create({ id: 'mem-1', schoolId: 's-1', userId: 'st-1', role: MemberRole.STUDENT, joinedAt: new Date() }),
    'owner-1',
    'evt-2',
  );
  return school;
}

describe('UpdateStudentHandler — back from the archive takes a seat (plan 90, phase 4)', () => {
  let schoolRepo: { findById: jest.Mock<() => Promise<School | null>> };
  let prisma: {
    schoolMember: { findUnique: jest.Mock<() => Promise<unknown>>; update: jest.Mock };
    studentLevelHistory: { updateMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let seatGate: { claim: jest.Mock<() => Promise<SeatUsage | null>> };
  let handler: UpdateStudentHandler;

  beforeEach(() => {
    schoolRepo = { findById: jest.fn<() => Promise<School | null>>() };
    prisma = {
      schoolMember: { findUnique: jest.fn<() => Promise<unknown>>(), update: jest.fn(() => 'update-op') },
      studentLevelHistory: { updateMany: jest.fn(() => 'end-op'), create: jest.fn(() => 'create-op') },
      $transaction: jest.fn(),
    };
    seatGate = { claim: jest.fn<() => Promise<SeatUsage | null>>() };
    schoolRepo.findById.mockResolvedValue(makeSchoolWithStudent());
    seatGate.claim.mockResolvedValue({ used: 101, limit: 100, ceiling: 110, state: 'warning' });
    handler = new UpdateStudentHandler(schoolRepo as never, prisma as never, seatGate as never);
  });

  it('archived → active claims the seat (the claim writes the status) and answers it', async () => {
    prisma.schoolMember.findUnique.mockResolvedValue({ status: 'archived', level: 'A2' });

    const result = await handler.execute(new UpdateStudentCommand('owner-1', 's-1', 'st-1', 'active'));

    expect(seatGate.claim).toHaveBeenCalledWith('s-1', { kind: 'reactivate', userId: 'st-1' });
    expect(prisma.schoolMember.update).not.toHaveBeenCalled();
    expect(result).toEqual({ seats: { used: 101, limit: 100, ceiling: 110, state: 'warning' } });
  });

  it('archived → active with a new level: the level is written apart from the status', async () => {
    prisma.schoolMember.findUnique.mockResolvedValue({ status: 'archived', level: 'A2' });

    await handler.execute(new UpdateStudentCommand('owner-1', 's-1', 'st-1', 'active', 'B1'));

    expect(prisma.schoolMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { level: 'B1' } }),
    );
  });

  it('no seat → SEATS_EXHAUSTED and nothing changes, the level included', async () => {
    prisma.schoolMember.findUnique.mockResolvedValue({ status: 'archived', level: 'A2' });
    seatGate.claim.mockRejectedValue(
      new SeatsExhaustedException('s-1', { used: 110, limit: 100, ceiling: 110, state: 'full' }),
    );

    await expect(
      handler.execute(new UpdateStudentCommand('owner-1', 's-1', 'st-1', 'active', 'B1')),
    ).rejects.toBeInstanceOf(SeatsExhaustedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('archiving or re-saving an active learner takes no seat', async () => {
    prisma.schoolMember.findUnique.mockResolvedValue({ status: 'active', level: 'A2' });

    await expect(handler.execute(new UpdateStudentCommand('owner-1', 's-1', 'st-1', 'active'))).resolves.toEqual({
      seats: null,
    });
    await handler.execute(new UpdateStudentCommand('owner-1', 's-1', 'st-1', 'archived'));

    expect(seatGate.claim).not.toHaveBeenCalled();
    expect(prisma.schoolMember.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: 'archived' } }),
    );
  });
});
