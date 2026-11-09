import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ErasedUserData,
  IUserDataEraser,
} from '../../application/ports/user-data-eraser.interface.js';

@Injectable()
export class UserDataPrismaEraser implements IUserDataEraser {
  constructor(private readonly prisma: PrismaService) {}

  async erase(userId: string): Promise<ErasedUserData> {
    return this.prisma.$transaction(async (tx) => {
      // Soft-deleted profiles too: the row is the data, whatever its flag says.
      const profiles = await tx.profile.findMany({
        where: { userId },
        select: { id: true },
      });
      const profileIds = profiles.map((p) => p.id);

      if (profileIds.length > 0) {
        // Children first — the relations have no ON DELETE CASCADE.
        await tx.studentTargetLanguage.deleteMany({
          where: { studentProfile: { profileId: { in: profileIds } } },
        });
        await tx.studentProfile.deleteMany({ where: { profileId: { in: profileIds } } });
        await tx.tutorTeachingLanguage.deleteMany({
          where: { tutorProfile: { profileId: { in: profileIds } } },
        });
        await tx.tutorProfile.deleteMany({ where: { profileId: { in: profileIds } } });
        await tx.teachingLanguage.deleteMany({
          where: { teachingProfile: { profileId: { in: profileIds } } },
        });
        await tx.teachingProfile.deleteMany({ where: { profileId: { in: profileIds } } });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
      }
      // A child account the user was guardian of stays, without the link to nobody.
      await tx.profile.updateMany({
        where: { guardianAccountId: userId },
        data: { guardianAccountId: null },
      });

      const placement = await tx.placementResult.deleteMany({ where: { userId } });
      const emailIndex = await tx.userEmailIndex.deleteMany({ where: { userId } });

      return {
        profiles: profileIds.length,
        placementResults: placement.count,
        emailIndex: emailIndex.count,
      };
    });
  }
}
