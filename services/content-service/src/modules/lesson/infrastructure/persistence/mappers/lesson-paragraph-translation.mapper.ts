import type { LessonParagraphTranslation } from '../../../../../../generated/prisma/client.js';
import { IParagraphTranslationRow } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';

// Shape for a single row in prisma.lessonParagraphTranslation.createMany({ data: [...] })
export interface LessonParagraphTranslationCreateRow {
  id: string;
  lessonContentVariantId: string;
  paragraphIndex: number;
  translation: string;
  createdAt: Date;
  updatedAt: Date;
}

export class LessonParagraphTranslationMapper {
  static toDomain(raw: LessonParagraphTranslation): IParagraphTranslationRow {
    return {
      paragraphIndex: raw.paragraphIndex,
      translation: raw.translation,
    };
  }

  static toCreateManyData(
    variantId: string,
    rows: IParagraphTranslationRow[],
  ): LessonParagraphTranslationCreateRow[] {
    const now = new Date();
    return rows.map((row) => ({
      id: crypto.randomUUID(),
      lessonContentVariantId: variantId,
      paragraphIndex: row.paragraphIndex,
      translation: row.translation,
      createdAt: now,
      updatedAt: now,
    }));
  }
}
