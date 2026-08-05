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

// Prisma Client's generated enum carries the *member names* (`VOCAB`), not the
// `@map` values (`vocab`) — the mapping only renames the Postgres enum labels.
// The domain enum deliberately holds the lowercase form, because that is the
// wire contract, so the two are NOT interchangeable and a cast between them
// produces a value Prisma rejects at runtime.
//
// These lookups are exhaustive by construction: adding a kind to either enum
// fails the build, which a cast would have silently allowed.
const DOMAIN_TO_PRISMA_KIND: Record<LessonSpanKind, PrismaSpanKind> = {
  [LessonSpanKind.VOCAB]: 'VOCAB',
  [LessonSpanKind.GRAMMAR]: 'GRAMMAR',
  [LessonSpanKind.CHUNK]: 'CHUNK',
};

const PRISMA_TO_DOMAIN_KIND: Record<PrismaSpanKind, LessonSpanKind> = {
  VOCAB: LessonSpanKind.VOCAB,
  GRAMMAR: LessonSpanKind.GRAMMAR,
  CHUNK: LessonSpanKind.CHUNK,
};

const toPrismaKind = (kind: LessonSpanKind): PrismaSpanKind => DOMAIN_TO_PRISMA_KIND[kind];
const toDomainKind = (kind: PrismaSpanKind): LessonSpanKind => PRISMA_TO_DOMAIN_KIND[kind];

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
