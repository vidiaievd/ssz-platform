import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ErasedUserContent,
  IDeletedUserEraser,
} from '../../application/ports/deleted-user-eraser.port.js';

@Injectable()
export class DeletedUserPrismaEraser implements IDeletedUserEraser {
  constructor(private readonly prisma: PrismaService) {}

  async erase(userId: string): Promise<ErasedUserContent> {
    return this.prisma.$transaction(async (tx) => {
      // Entries first: one may point at a catalogue item, which stays.
      const words = await tx.personalVocabularyEntry.deleteMany({ where: { userId } });

      // The personal list is an ordinary vocabulary list owned by the user. Deleting it
      // cascades to its items with the translations and examples the student wrote, and
      // to the personal_vocabulary_lists row.
      const personal = await tx.personalVocabularyList.findMany({
        where: { userId },
        select: { vocabularyListId: true },
      });
      const listIds = personal.map((p) => p.vocabularyListId);
      if (listIds.length > 0) {
        await tx.vocabularyList.deleteMany({ where: { id: { in: listIds } } });
      }

      // Revoked and expired rows too: the row is the data, whatever its flag says.
      const entitlements = await tx.contentEntitlement.deleteMany({ where: { userId } });
      const sharesReceived = await tx.contentShare.deleteMany({
        where: { sharedWithUserId: userId },
      });

      const owned = { ownerUserId: userId, deletedAt: null };
      const authored = await Promise.all([
        tx.container.count({ where: owned }),
        tx.lesson.count({ where: owned }),
        tx.vocabularyList.count({ where: owned }),
        tx.exercise.count({ where: owned }),
        tx.grammarRule.count({ where: owned }),
      ]);

      return {
        words: words.count,
        personalLists: listIds.length,
        entitlements: entitlements.count,
        sharesReceived: sharesReceived.count,
        authoredLeft: authored.reduce((sum, n) => sum + n, 0),
      };
    });
  }
}
