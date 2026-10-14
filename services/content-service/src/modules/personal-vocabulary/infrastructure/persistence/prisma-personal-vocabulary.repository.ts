import { Injectable } from '@nestjs/common';
import type { PersonalVocabularyEntry } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PersonalVocabularyEntryEntity } from '../../domain/entities/personal-vocabulary-entry.entity.js';
import type { IPersonalVocabularyRepository } from '../../domain/repositories/personal-vocabulary.repository.interface.js';

@Injectable()
export class PrismaPersonalVocabularyRepository implements IPersonalVocabularyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEntryById(entryId: string): Promise<PersonalVocabularyEntryEntity | null> {
    const raw = await this.prisma.personalVocabularyEntry.findUnique({ where: { id: entryId } });
    return raw ? toDomain(raw) : null;
  }

  async findEntryByItem(
    userId: string,
    vocabularyItemId: string,
  ): Promise<PersonalVocabularyEntryEntity | null> {
    const raw = await this.prisma.personalVocabularyEntry.findUnique({
      where: { userId_vocabularyItemId: { userId, vocabularyItemId } },
    });
    return raw ? toDomain(raw) : null;
  }

  async saveEntry(entry: PersonalVocabularyEntryEntity): Promise<void> {
    const context = {
      contextSentence: entry.context?.sentence ?? null,
      sourceVariantId: entry.context?.variantId ?? null,
      sourceParagraph: entry.context?.paragraphIndex ?? null,
      sourceCharStart: entry.context?.charStart ?? null,
    };
    await this.prisma.personalVocabularyEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        userId: entry.userId,
        targetLanguage: entry.targetLanguage,
        vocabularyItemId: entry.vocabularyItemId,
        surfaceForm: entry.surfaceForm,
        createdAt: entry.createdAt,
        ...context,
      },
      update: context,
    });
  }

  async deleteEntry(entryId: string): Promise<void> {
    await this.prisma.personalVocabularyEntry.deleteMany({ where: { id: entryId } });
  }

  async findPersonalListId(userId: string, targetLanguage: string): Promise<string | null> {
    const raw = await this.prisma.personalVocabularyList.findUnique({
      where: { userId_targetLanguage: { userId, targetLanguage } },
      select: { vocabularyListId: true },
    });
    return raw?.vocabularyListId ?? null;
  }

  async linkPersonalList(
    userId: string,
    targetLanguage: string,
    vocabularyListId: string,
  ): Promise<string> {
    // ON CONFLICT DO NOTHING rather than a caught unique violation: the loser's insert
    // must not abort anything, it only has to learn which list won.
    await this.prisma.$executeRaw`
      INSERT INTO personal_vocabulary_lists (user_id, target_language, vocabulary_list_id)
      VALUES (${userId}::uuid, ${targetLanguage}, ${vocabularyListId}::uuid)
      ON CONFLICT (user_id, target_language) DO NOTHING`;
    const winner = await this.findPersonalListId(userId, targetLanguage);
    return winner ?? vocabularyListId;
  }
}

function toDomain(raw: PersonalVocabularyEntry): PersonalVocabularyEntryEntity {
  const hasContext =
    raw.contextSentence !== null ||
    raw.sourceVariantId !== null ||
    raw.sourceParagraph !== null ||
    raw.sourceCharStart !== null;
  return PersonalVocabularyEntryEntity.reconstitute(raw.id, {
    userId: raw.userId,
    targetLanguage: raw.targetLanguage,
    vocabularyItemId: raw.vocabularyItemId,
    surfaceForm: raw.surfaceForm,
    context: hasContext
      ? {
          sentence: raw.contextSentence,
          variantId: raw.sourceVariantId,
          paragraphIndex: raw.sourceParagraph,
          charStart: raw.sourceCharStart,
        }
      : null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  });
}
