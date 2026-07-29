import type {
  LessonTextSpan,
  LessonSpanKind as PrismaSpanKind,
} from '../../../../../../generated/prisma/client.js';
import { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';

// Shape passed to prisma.lessonTextSpan.create({ data: ... })
export interface LessonTextSpanCreateData {
  id: string;
  lessonContentVariantId: string;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  kind: PrismaSpanKind;
  refId: string | null;
  textSnapshot: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
}

// The Prisma enum is generated from the same @map values as the domain enum, so
// the two are string-identical; the casts keep that assumption in one place.
const toPrismaKind = (kind: LessonSpanKind): PrismaSpanKind => kind as unknown as PrismaSpanKind;
const toDomainKind = (kind: PrismaSpanKind): LessonSpanKind => kind as unknown as LessonSpanKind;

export class LessonTextSpanMapper {
  static toDomain(raw: LessonTextSpan): LessonTextSpanEntity {
    return LessonTextSpanEntity.reconstitute(raw.id, {
      lessonContentVariantId: raw.lessonContentVariantId,
      paragraphIndex: raw.paragraphIndex,
      charStart: raw.charStart,
      charEnd: raw.charEnd,
      kind: toDomainKind(raw.kind),
      refId: raw.refId,
      textSnapshot: raw.textSnapshot,
      note: raw.note,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      createdByUserId: raw.createdByUserId,
    });
  }

  static toCreateData(entity: LessonTextSpanEntity): LessonTextSpanCreateData {
    return {
      id: entity.id,
      lessonContentVariantId: entity.lessonContentVariantId,
      paragraphIndex: entity.paragraphIndex,
      charStart: entity.charStart,
      charEnd: entity.charEnd,
      kind: toPrismaKind(entity.kind),
      refId: entity.refId,
      textSnapshot: entity.textSnapshot,
      note: entity.note,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      createdByUserId: entity.createdByUserId,
    };
  }
}
