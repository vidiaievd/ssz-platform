import type { LessonVariantMediaRef } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { LessonVariantMediaRefEntity } from '../../../domain/entities/lesson-variant-media-ref.entity.js';
import { IMediaRefRow } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import { prismaMediaRefTypeToDomain, domainMediaRefTypeToPrisma } from './enum-converters.js';

// Shape for a single row in prisma.lessonVariantMediaRef.createMany({ data: [...] })
export interface LessonVariantMediaRefCreateRow {
  id: string;
  lessonContentVariantId: string;
  mediaId: string;
  mediaType: $Enums.MediaRefType;
  positionInText: number;
  extractedAt: Date;
}

export class LessonVariantMediaRefMapper {
  static toDomain(raw: LessonVariantMediaRef): LessonVariantMediaRefEntity {
    return LessonVariantMediaRefEntity.reconstitute(raw.id, {
      lessonContentVariantId: raw.lessonContentVariantId,
      mediaId: raw.mediaId,
      mediaType: prismaMediaRefTypeToDomain(raw.mediaType),
      positionInText: raw.positionInText,
      extractedAt: raw.extractedAt,
    });
  }

  /**
   * Converts parsed IMediaRefRow entries into Prisma createMany rows.
   * Each row gets a fresh UUID via crypto.randomUUID() and extractedAt = now.
   * Used by PrismaLessonVariantMediaRefRepository.replaceForVariant().
   */
  static toCreateManyData(
    variantId: string,
    refs: IMediaRefRow[],
  ): LessonVariantMediaRefCreateRow[] {
    const extractedAt = new Date();
    return refs.map((ref) => ({
      id: crypto.randomUUID(),
      lessonContentVariantId: variantId,
      mediaId: ref.mediaId,
      mediaType: domainMediaRefTypeToPrisma(ref.mediaType),
      positionInText: ref.positionInText,
      extractedAt,
    }));
  }
}
