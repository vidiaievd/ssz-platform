import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ErasedLearnerData,
  IDeletedUserEraser,
} from '../../application/ports/deleted-user-eraser.port.js';

@Injectable()
export class DeletedUserPrismaEraser implements IDeletedUserEraser {
  constructor(private readonly prisma: PrismaService) {}

  async erase(userId: string): Promise<ErasedLearnerData> {
    return this.prisma.$transaction(async (tx) => {
      // Soft-deleted enrolments and assignments too: the row is the data, whatever its flag says.
      const enrollments = await tx.enrollment.deleteMany({ where: { userId } });
      // One row per student, also for a group assignment — the group keeps the others'.
      const assignments = await tx.assignment.deleteMany({ where: { assigneeId: userId } });
      const progress = await tx.userProgress.deleteMany({ where: { userId } });
      const srsCards = await tx.srsReviewCard.deleteMany({ where: { userId } });
      const canDo = await tx.canDoProgress.deleteMany({ where: { userId } });

      return {
        enrollments: enrollments.count,
        assignments: assignments.count,
        progress: progress.count,
        srsCards: srsCards.count,
        canDo: canDo.count,
      };
    });
  }
}
