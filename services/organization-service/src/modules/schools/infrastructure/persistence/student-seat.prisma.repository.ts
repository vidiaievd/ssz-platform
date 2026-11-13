import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { SeatDecision } from '../../domain/value-objects/seat-policy.vo.js';
import type { IStudentSeatRepository, SeatClaim } from '../../domain/repositories/student-seat.repository.interface.js';
import { MemberAlreadyExistsException } from '../../domain/exceptions/member-already-exists.exception.js';

const ACTIVE_STUDENT = { role: 'STUDENT', status: 'active' } as const;

/**
 * Student seats over `school_members` (plan 90, phase 4).
 *
 * `claim` runs in one transaction holding `pg_advisory_xact_lock` keyed by the school: the
 * count and the write happen with no other claim of the same school in between, and the lock
 * goes with the transaction. Other roster writes (the aggregate's save, archiving) do not
 * take the lock — they never add a seat.
 */
@Injectable()
export class StudentSeatPrismaRepository implements IStudentSeatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countActiveStudents(schoolId: string): Promise<number> {
    return (this.prisma as any).schoolMember.count({ where: { schoolId, ...ACTIVE_STUDENT } });
  }

  async claim(schoolId: string, claim: SeatClaim, decide: (used: number) => SeatDecision): Promise<SeatDecision> {
    try {
      return await (this.prisma as any).$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`school-seats:${schoolId}`}, 0))`;
        const used: number = await tx.schoolMember.count({ where: { schoolId, ...ACTIVE_STUDENT } });
        const decision = decide(used);
        if (!decision.admitted) return decision;

        if (claim.kind === 'insert') {
          await tx.schoolMember.create({
            data: {
              id: claim.memberId,
              schoolId,
              userId: claim.userId,
              role: 'STUDENT',
              status: 'active',
              joinedAt: claim.joinedAt,
              name: claim.name,
              avatarUrl: claim.avatarUrl,
            },
          });
        } else {
          await tx.schoolMember.updateMany({
            where: { schoolId, userId: claim.userId, role: 'STUDENT', status: 'archived' },
            data: { status: 'active' },
          });
        }
        return decision;
      });
    } catch (err) {
      // Another request put the same user on the roster between the aggregate's check and here.
      if (claim.kind === 'insert' && (err as { code?: string })?.code === 'P2002') {
        throw new MemberAlreadyExistsException(claim.userId, schoolId);
      }
      throw err;
    }
  }
}
