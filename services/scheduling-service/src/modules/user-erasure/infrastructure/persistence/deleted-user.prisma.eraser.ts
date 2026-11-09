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
      const lessonScores = await tx.lessonScore.deleteMany({ where: { studentId: userId } });
      // Organization publishes the removal too, but not necessarily before this arrives.
      const memberships = await tx.schoolMembership.deleteMany({ where: { userId } });

      return { lessonScores: lessonScores.count, memberships: memberships.count };
    });
  }
}
