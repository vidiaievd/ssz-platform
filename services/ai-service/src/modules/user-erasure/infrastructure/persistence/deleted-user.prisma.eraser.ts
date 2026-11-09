import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ErasedLearnerData, IDeletedUserEraser } from '../../application/ports/deleted-user-eraser.port.js';

@Injectable()
export class DeletedUserPrismaEraser implements IDeletedUserEraser {
  constructor(private readonly prisma: PrismaService) {}

  async erase(userId: string): Promise<ErasedLearnerData> {
    return this.prisma.$transaction(async (tx) => {
      // The role goes with the id: alone it says nothing, beside a school payer it narrows.
      const calls = await tx.aiCall.updateMany({
        where: { actorUserId: userId },
        data: { actorUserId: null, actorRole: null },
      });
      // The reason is the learner's own words.
      const feedback = await tx.assistFeedback.deleteMany({ where: { userId } });
      // A snapshot subscription-service sends on closing the account may land after this and
      // bring the cache row back; it names nothing subscription-service does not keep.
      const entitlements = await tx.aiPayerEntitlements.deleteMany({ where: { payerType: 'user', payerId: userId } });
      const policies = await tx.aiPayerPolicy.deleteMany({ where: { payerType: 'user', payerId: userId } });

      return {
        callsUnlinked: calls.count,
        feedback: feedback.count,
        payerRows: entitlements.count + policies.count,
      };
    });
  }
}
