import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ErasedLearnerAttempts,
  IDeletedUserEraser,
} from '../../application/ports/deleted-user-eraser.port.js';

@Injectable()
export class DeletedUserPrismaEraser implements IDeletedUserEraser {
  constructor(private readonly prisma: PrismaService) {}

  async erase(userId: string): Promise<ErasedLearnerAttempts> {
    return this.prisma.$transaction(async (tx) => {
      // attempt_ai_drafts go with their attempt (ON DELETE CASCADE).
      const attempts = await tx.attempt.deleteMany({ where: { userId } });
      // A promoted probe already lives on as the teacher's exercise in content.
      const probes = await tx.probeTask.deleteMany({ where: { userId } });
      return { attempts: attempts.count, probes: probes.count };
    });
  }
}
