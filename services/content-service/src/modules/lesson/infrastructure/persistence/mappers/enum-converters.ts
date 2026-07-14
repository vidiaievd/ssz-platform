import { $Enums } from '../../../../../../generated/prisma/client.js';
import { VariantStatus } from '../../../domain/value-objects/variant-status.vo.js';
import { MediaRefType } from '../../../domain/value-objects/media-ref-type.vo.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';

// DifficultyLevel and Visibility conversions are shared with the container module.
export {
  prismaDifficultyToDomain,
  domainDifficultyToPrisma,
  prismaVisibilityToDomain,
  domainVisibilityToPrisma,
} from '../../../../container/infrastructure/persistence/mappers/enum-converters.js';

// ─── VariantStatus ───────────────────────────────────────────────────────────
// Prisma stores UPPER_CASE ('DRAFT', 'PUBLISHED'); domain uses lowercase ('draft', 'published').

const PRISMA_TO_DOMAIN_VARIANT_STATUS: Record<$Enums.VariantStatus, VariantStatus> = {
  DRAFT: VariantStatus.DRAFT,
  PUBLISHED: VariantStatus.PUBLISHED,
};

const DOMAIN_TO_PRISMA_VARIANT_STATUS: Record<VariantStatus, $Enums.VariantStatus> = {
  [VariantStatus.DRAFT]: 'DRAFT',
  [VariantStatus.PUBLISHED]: 'PUBLISHED',
};

export function prismaVariantStatusToDomain(value: $Enums.VariantStatus): VariantStatus {
  return PRISMA_TO_DOMAIN_VARIANT_STATUS[value];
}

export function domainVariantStatusToPrisma(value: VariantStatus): $Enums.VariantStatus {
  return DOMAIN_TO_PRISMA_VARIANT_STATUS[value];
}

// ─── MediaRefType ────────────────────────────────────────────────────────────
// Prisma stores UPPER_CASE ('IMAGE', 'AUDIO', 'VIDEO'); domain uses lowercase ('image', 'audio', 'video').

const PRISMA_TO_DOMAIN_MEDIA_REF_TYPE: Record<$Enums.MediaRefType, MediaRefType> = {
  IMAGE: MediaRefType.IMAGE,
  AUDIO: MediaRefType.AUDIO,
  VIDEO: MediaRefType.VIDEO,
};

const DOMAIN_TO_PRISMA_MEDIA_REF_TYPE: Record<MediaRefType, $Enums.MediaRefType> = {
  [MediaRefType.IMAGE]: 'IMAGE',
  [MediaRefType.AUDIO]: 'AUDIO',
  [MediaRefType.VIDEO]: 'VIDEO',
};

export function prismaMediaRefTypeToDomain(value: $Enums.MediaRefType): MediaRefType {
  return PRISMA_TO_DOMAIN_MEDIA_REF_TYPE[value];
}

export function domainMediaRefTypeToPrisma(value: MediaRefType): $Enums.MediaRefType {
  return DOMAIN_TO_PRISMA_MEDIA_REF_TYPE[value];
}

// ─── LessonKind ──────────────────────────────────────────────────────────────
// Prisma stores UPPER_CASE ('TEXT', 'VIDEO', 'AUDIO', 'LIVE'); domain uses lowercase.

const PRISMA_TO_DOMAIN_LESSON_KIND: Record<$Enums.LessonKind, LessonKind> = {
  TEXT: LessonKind.TEXT,
  VIDEO: LessonKind.VIDEO,
  AUDIO: LessonKind.AUDIO,
  LIVE: LessonKind.LIVE,
};

const DOMAIN_TO_PRISMA_LESSON_KIND: Record<LessonKind, $Enums.LessonKind> = {
  [LessonKind.TEXT]: 'TEXT',
  [LessonKind.VIDEO]: 'VIDEO',
  [LessonKind.AUDIO]: 'AUDIO',
  [LessonKind.LIVE]: 'LIVE',
};

export function prismaLessonKindToDomain(value: $Enums.LessonKind): LessonKind {
  return PRISMA_TO_DOMAIN_LESSON_KIND[value];
}

export function domainLessonKindToPrisma(value: LessonKind): $Enums.LessonKind {
  return DOMAIN_TO_PRISMA_LESSON_KIND[value];
}
