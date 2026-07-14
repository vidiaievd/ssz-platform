import type { LessonVariantGlossaryMark } from '../../../../../../generated/prisma/client.js';
import { GlossaryMarkRow } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';

export class LessonGlossaryMarkMapper {
  static toDomain(raw: LessonVariantGlossaryMark): GlossaryMarkRow {
    return {
      id: raw.id,
      vocabularyItemId: raw.vocabularyItemId,
      occurrenceCount: raw.occurrenceCount,
    };
  }
}
