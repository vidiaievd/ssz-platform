import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { TaggableEntityType } from '../../../access-control/domain/types/taggable-entity-type.js';
import type { CatalogFilters } from '../../domain/types/catalog-filters.js';

// ── Domain → Prisma enum conversions ─────────────────────────────────────────
// Domain enums use lowercase @map values; Prisma client uses uppercase key names.
// Kept local to avoid coupling to module-specific mappers.

const DOMAIN_TO_PRISMA_VISIBILITY: Record<string, string> = {
  public: 'PUBLIC',
  school_private: 'SCHOOL_PRIVATE',
  shared: 'SHARED',
  private: 'PRIVATE',
};

const DOMAIN_TO_PRISMA_ENTITY_TYPE: Record<string, string> = {
  container: 'CONTAINER',
  lesson: 'LESSON',
  vocabulary_list: 'VOCABULARY_LIST',
  grammar_rule: 'GRAMMAR_RULE',
  exercise: 'EXERCISE',
};

export interface CatalogWhereResult {
  /**
   * Prisma-compatible where clause. Cast to the specific entity's WhereInput
   * at the call site (e.g. `as Prisma.ContainerWhereInput`).
   */
  where: Record<string, unknown>;
}

export interface CatalogQueryContext {
  filters: CatalogFilters;
  user: AuthenticatedUser;
  /**
   * List of school IDs the user is a member of (any role).
   * Used to include SCHOOL_PRIVATE content from those schools.
   *
   * TODO (Block 7+): replace with a batch lookup via OrganizationClient
   * instead of per-school getMemberRole calls at the handler layer.
   */
  schoolMemberships: string[];
  tableContext: { entityType: TaggableEntityType };
}

@Injectable()
export class CatalogQueryBuilderService {
  private readonly logger = new Logger(CatalogQueryBuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async build(ctx: CatalogQueryContext): Promise<CatalogWhereResult> {
    const { filters, user, schoolMemberships, tableContext } = ctx;
    const prismaEntityType = DOMAIN_TO_PRISMA_ENTITY_TYPE[tableContext.entityType];

    // ── 6. Tag pre-query ───────────────────────────────────────────────────────
    // OR semantics: entity must have at least one of the provided tag IDs.
    // Empty tagIds input → no filter applied.
    // Non-empty with zero matches → where clause forces empty result set.
    let tagEntityIds: string[] | undefined;
    if (filters.tagIds && filters.tagIds.length > 0) {
      const rows = await this.prisma.tagAssignment.findMany({
        where: {
          tagId: { in: filters.tagIds },
          entityType: prismaEntityType as never,
        },
        select: { entityId: true },
        distinct: ['entityId'],
      });
      tagEntityIds = rows.map((r) => r.entityId);
    }

    // ── SHARED visibility pre-query ────────────────────────────────────────────
    // Fetch entity IDs that have an active share for this user so they can be
    // included in the visibility OR clause below.
    const sharedEntityIds = await this.prisma.contentShare.findMany({
      where: {
        sharedWithUserId: user.userId,
        entityType: prismaEntityType as never,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { entityId: true },
    });
    const sharedIds = sharedEntityIds.map((r) => r.entityId);

    // ── Build visibility OR scope ──────────────────────────────────────────────
    // Ensures the catalog only surfaces content the requesting user is allowed
    // to see, without raising 403s (silent filter semantics from Block 5).
    const visibilityOrClauses: Record<string, unknown>[] = [
      { visibility: 'PUBLIC' },
      { ownerUserId: user.userId },
    ];

    if (schoolMemberships.length > 0) {
      visibilityOrClauses.push({
        visibility: 'SCHOOL_PRIVATE',
        ownerSchoolId: { in: schoolMemberships },
      });
    }

    if (sharedIds.length > 0) {
      visibilityOrClauses.push({
        visibility: 'SHARED',
        id: { in: sharedIds },
      });
    }

    // ── Compose AND clauses ────────────────────────────────────────────────────
    const andClauses: Record<string, unknown>[] = [
      // 2. Visibility scope
      { OR: visibilityOrClauses },
    ];

    // 3. User-specified visibility ANDed on top of the scope above
    if (filters.visibility) {
      andClauses.push({ visibility: DOMAIN_TO_PRISMA_VISIBILITY[filters.visibility] });
    }

    // 4. Equality filters
    if (filters.targetLanguage) {
      andClauses.push({ targetLanguage: filters.targetLanguage });
    }
    if (filters.difficultyLevel) {
      // DifficultyLevel has no @map on values (A1, A2 … C2) — domain values match Prisma keys.
      andClauses.push({ difficultyLevel: filters.difficultyLevel });
    }
    if (filters.ownerSchoolId) {
      andClauses.push({ ownerSchoolId: filters.ownerSchoolId });
    }
    if (filters.ownerUserId) {
      andClauses.push({ ownerUserId: filters.ownerUserId });
    }

    // 5. Search — ILIKE on title and description (OR'd).
    // Note: Exercise has no title column; callers should skip CatalogFilters.search
    // for exercises and handle it separately if needed.
    if (filters.search) {
      andClauses.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    // 6. Tag filter — id must be in pre-queried set (OR semantics across tagIds).
    if (tagEntityIds !== undefined) {
      // tagEntityIds=[] means no entities match → intentionally forces empty result.
      andClauses.push({ id: { in: tagEntityIds } });
    }

    return {
      where: {
        // 1. Soft-delete guard — always applied
        deletedAt: null,
        AND: andClauses,
      },
    };
  }
}
