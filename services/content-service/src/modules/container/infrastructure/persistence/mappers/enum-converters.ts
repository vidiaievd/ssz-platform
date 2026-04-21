import { $Enums } from '../../../../../../generated/prisma/client.js';
import { ContainerType } from '../../../domain/value-objects/container-type.vo.js';
import { DifficultyLevel } from '../../../domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../domain/value-objects/access-tier.vo.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';

// ─── ContainerType ───────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_CONTAINER_TYPE: Record<$Enums.ContainerType, ContainerType> = {
  COURSE: ContainerType.COURSE,
  MODULE: ContainerType.MODULE,
  COLLECTION: ContainerType.COLLECTION,
};

const DOMAIN_TO_PRISMA_CONTAINER_TYPE: Record<ContainerType, $Enums.ContainerType> = {
  [ContainerType.COURSE]: 'COURSE',
  [ContainerType.MODULE]: 'MODULE',
  [ContainerType.COLLECTION]: 'COLLECTION',
};

export function prismaContainerTypeToDomain(value: $Enums.ContainerType): ContainerType {
  return PRISMA_TO_DOMAIN_CONTAINER_TYPE[value];
}

export function domainContainerTypeToPrisma(value: ContainerType): $Enums.ContainerType {
  return DOMAIN_TO_PRISMA_CONTAINER_TYPE[value];
}

// ─── DifficultyLevel ─────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_DIFFICULTY: Record<$Enums.DifficultyLevel, DifficultyLevel> = {
  A1: DifficultyLevel.A1,
  A2: DifficultyLevel.A2,
  B1: DifficultyLevel.B1,
  B2: DifficultyLevel.B2,
  C1: DifficultyLevel.C1,
  C2: DifficultyLevel.C2,
};

const DOMAIN_TO_PRISMA_DIFFICULTY: Record<DifficultyLevel, $Enums.DifficultyLevel> = {
  [DifficultyLevel.A1]: 'A1',
  [DifficultyLevel.A2]: 'A2',
  [DifficultyLevel.B1]: 'B1',
  [DifficultyLevel.B2]: 'B2',
  [DifficultyLevel.C1]: 'C1',
  [DifficultyLevel.C2]: 'C2',
};

export function prismaDifficultyToDomain(value: $Enums.DifficultyLevel): DifficultyLevel {
  return PRISMA_TO_DOMAIN_DIFFICULTY[value];
}

export function domainDifficultyToPrisma(value: DifficultyLevel): $Enums.DifficultyLevel {
  return DOMAIN_TO_PRISMA_DIFFICULTY[value];
}

// ─── Visibility ──────────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_VISIBILITY: Record<$Enums.Visibility, Visibility> = {
  PUBLIC: Visibility.PUBLIC,
  SCHOOL_PRIVATE: Visibility.SCHOOL_PRIVATE,
  SHARED: Visibility.SHARED,
  PRIVATE: Visibility.PRIVATE,
};

const DOMAIN_TO_PRISMA_VISIBILITY: Record<Visibility, $Enums.Visibility> = {
  [Visibility.PUBLIC]: 'PUBLIC',
  [Visibility.SCHOOL_PRIVATE]: 'SCHOOL_PRIVATE',
  [Visibility.SHARED]: 'SHARED',
  [Visibility.PRIVATE]: 'PRIVATE',
};

export function prismaVisibilityToDomain(value: $Enums.Visibility): Visibility {
  return PRISMA_TO_DOMAIN_VISIBILITY[value];
}

export function domainVisibilityToPrisma(value: Visibility): $Enums.Visibility {
  return DOMAIN_TO_PRISMA_VISIBILITY[value];
}

// ─── AccessTier ──────────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_ACCESS_TIER: Record<$Enums.AccessTier, AccessTier> = {
  ASSIGNED_ONLY: AccessTier.ASSIGNED_ONLY,
  ENTITLEMENT_REQUIRED: AccessTier.ENTITLEMENT_REQUIRED,
  FREE_WITHIN_SCHOOL: AccessTier.FREE_WITHIN_SCHOOL,
  PUBLIC_FREE: AccessTier.PUBLIC_FREE,
  PUBLIC_PAID: AccessTier.PUBLIC_PAID,
};

const DOMAIN_TO_PRISMA_ACCESS_TIER: Record<AccessTier, $Enums.AccessTier> = {
  [AccessTier.ASSIGNED_ONLY]: 'ASSIGNED_ONLY',
  [AccessTier.ENTITLEMENT_REQUIRED]: 'ENTITLEMENT_REQUIRED',
  [AccessTier.FREE_WITHIN_SCHOOL]: 'FREE_WITHIN_SCHOOL',
  [AccessTier.PUBLIC_FREE]: 'PUBLIC_FREE',
  [AccessTier.PUBLIC_PAID]: 'PUBLIC_PAID',
};

export function prismaAccessTierToDomain(value: $Enums.AccessTier): AccessTier {
  return PRISMA_TO_DOMAIN_ACCESS_TIER[value];
}

export function domainAccessTierToPrisma(value: AccessTier): $Enums.AccessTier {
  return DOMAIN_TO_PRISMA_ACCESS_TIER[value];
}

// ─── VersionStatus ───────────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_VERSION_STATUS: Record<$Enums.VersionStatus, VersionStatus> = {
  DRAFT: VersionStatus.DRAFT,
  PUBLISHED: VersionStatus.PUBLISHED,
  DEPRECATED: VersionStatus.DEPRECATED,
  ARCHIVED: VersionStatus.ARCHIVED,
};

const DOMAIN_TO_PRISMA_VERSION_STATUS: Record<VersionStatus, $Enums.VersionStatus> = {
  [VersionStatus.DRAFT]: 'DRAFT',
  [VersionStatus.PUBLISHED]: 'PUBLISHED',
  [VersionStatus.DEPRECATED]: 'DEPRECATED',
  [VersionStatus.ARCHIVED]: 'ARCHIVED',
};

export function prismaVersionStatusToDomain(value: $Enums.VersionStatus): VersionStatus {
  return PRISMA_TO_DOMAIN_VERSION_STATUS[value];
}

export function domainVersionStatusToPrisma(value: VersionStatus): $Enums.VersionStatus {
  return DOMAIN_TO_PRISMA_VERSION_STATUS[value];
}

// ─── ContainerItemType ───────────────────────────────────────────────────────

const PRISMA_TO_DOMAIN_ITEM_TYPE: Record<$Enums.ContainerItemType, ContainerItemType> = {
  CONTAINER: ContainerItemType.CONTAINER,
  LESSON: ContainerItemType.LESSON,
  VOCABULARY_LIST: ContainerItemType.VOCABULARY_LIST,
  GRAMMAR_RULE: ContainerItemType.GRAMMAR_RULE,
  EXERCISE: ContainerItemType.EXERCISE,
};

const DOMAIN_TO_PRISMA_ITEM_TYPE: Record<ContainerItemType, $Enums.ContainerItemType> = {
  [ContainerItemType.CONTAINER]: 'CONTAINER',
  [ContainerItemType.LESSON]: 'LESSON',
  [ContainerItemType.VOCABULARY_LIST]: 'VOCABULARY_LIST',
  [ContainerItemType.GRAMMAR_RULE]: 'GRAMMAR_RULE',
  [ContainerItemType.EXERCISE]: 'EXERCISE',
};

export function prismaItemTypeToDomain(value: $Enums.ContainerItemType): ContainerItemType {
  return PRISMA_TO_DOMAIN_ITEM_TYPE[value];
}

export function domainItemTypeToPrisma(value: ContainerItemType): $Enums.ContainerItemType {
  return DOMAIN_TO_PRISMA_ITEM_TYPE[value];
}
