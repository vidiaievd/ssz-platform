// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The service under test receives PrismaService via
// constructor injection so the module itself is never called in these unit tests.
jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { CatalogQueryBuilderService } from './catalog-query-builder.service.js';
import type { CatalogQueryContext } from './catalog-query-builder.service.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { TaggableEntityType } from '../../../access-control/domain/types/taggable-entity-type.js';
import { Visibility } from '../../../../modules/container/domain/value-objects/visibility.vo.js';
import { DifficultyLevel } from '../../../../modules/container/domain/value-objects/difficulty-level.vo.js';

function makeUser(userId = 'user-1'): AuthenticatedUser {
  return { userId, roles: [] } as unknown as AuthenticatedUser;
}

function makePrisma(
  opts: {
    tagRows?: { entityId: string }[];
    sharedRows?: { entityId: string }[];
  } = {},
) {
  return {
    tagAssignment: {
      findMany: jest.fn().mockResolvedValue(opts.tagRows ?? []),
    },
    contentShare: {
      findMany: jest.fn().mockResolvedValue(opts.sharedRows ?? []),
    },
  };
}

function makeSvc(prisma: ReturnType<typeof makePrisma>): CatalogQueryBuilderService {
  return new CatalogQueryBuilderService(prisma as never);
}

function makeCtx(overrides: Partial<CatalogQueryContext> = {}): CatalogQueryContext {
  return {
    filters: {},
    user: makeUser(),
    schoolMemberships: [],
    tableContext: { entityType: TaggableEntityType.LESSON },
    ...overrides,
  };
}

describe('CatalogQueryBuilderService', () => {
  describe('soft-delete guard', () => {
    it('always includes deletedAt: null', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx());
      expect(where.deletedAt).toBeNull();
    });
  });

  describe('visibility OR scope', () => {
    it('always includes PUBLIC and ownerUserId arms', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ user: makeUser('u-99') }));
      const and = where.AND as Record<string, unknown>[];
      const visScope = and.find(
        (c) => 'OR' in c && !('title' in ((c.OR as unknown[])[0] as object)),
      );
      const orClauses = (visScope?.OR as Record<string, unknown>[]) ?? [];
      expect(orClauses).toContainEqual({ visibility: 'PUBLIC' });
      expect(orClauses).toContainEqual({ ownerUserId: 'u-99' });
    });

    it('adds SCHOOL_PRIVATE arm when schoolMemberships is non-empty', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ schoolMemberships: ['school-1', 'school-2'] }));
      const and = where.AND as Record<string, unknown>[];
      const visScope = and[0] as { OR: Record<string, unknown>[] };
      expect(visScope.OR).toContainEqual({
        visibility: 'SCHOOL_PRIVATE',
        ownerSchoolId: { in: ['school-1', 'school-2'] },
      });
    });

    it('omits SCHOOL_PRIVATE arm when schoolMemberships is empty', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ schoolMemberships: [] }));
      const and = where.AND as Record<string, unknown>[];
      const visScope = and[0] as { OR: Record<string, unknown>[] };
      expect(visScope.OR.some((c) => c['visibility'] === 'SCHOOL_PRIVATE')).toBe(false);
    });

    it('adds SHARED arm when contentShare pre-query returns results', async () => {
      const prisma = makePrisma({ sharedRows: [{ entityId: 'e-1' }, { entityId: 'e-2' }] });
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx());
      const and = where.AND as Record<string, unknown>[];
      const visScope = and[0] as { OR: Record<string, unknown>[] };
      expect(visScope.OR).toContainEqual({ visibility: 'SHARED', id: { in: ['e-1', 'e-2'] } });
    });

    it('omits SHARED arm when contentShare pre-query returns no results', async () => {
      const prisma = makePrisma({ sharedRows: [] });
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx());
      const and = where.AND as Record<string, unknown>[];
      const visScope = and[0] as { OR: Record<string, unknown>[] };
      expect(visScope.OR.some((c) => c['visibility'] === 'SHARED')).toBe(false);
    });
  });

  describe('optional AND filters', () => {
    it('adds visibility equality filter when filters.visibility is set', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { visibility: Visibility.PUBLIC } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ visibility: 'PUBLIC' });
    });

    it('adds targetLanguage filter', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { targetLanguage: 'en' } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ targetLanguage: 'en' });
    });

    it('adds difficultyLevel filter', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(
        makeCtx({ filters: { difficultyLevel: DifficultyLevel.B2 } }),
      );
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ difficultyLevel: 'B2' });
    });

    it('adds ownerSchoolId filter', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { ownerSchoolId: 'school-x' } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ ownerSchoolId: 'school-x' });
    });

    it('adds ownerUserId filter', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { ownerUserId: 'u-xyz' } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ ownerUserId: 'u-xyz' });
    });

    it('adds search ILIKE filter on title and description', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { search: 'hello' } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({
        OR: [
          { title: { contains: 'hello', mode: 'insensitive' } },
          { description: { contains: 'hello', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('tag filter (pre-query)', () => {
    it('does not query tagAssignment when tagIds is empty', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      await svc.build(makeCtx({ filters: { tagIds: [] } }));
      expect(prisma.tagAssignment.findMany).not.toHaveBeenCalled();
    });

    it('does not query tagAssignment when tagIds is absent', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      await svc.build(makeCtx({ filters: {} }));
      expect(prisma.tagAssignment.findMany).not.toHaveBeenCalled();
    });

    it('adds id IN clause with matched entity IDs', async () => {
      const prisma = makePrisma({ tagRows: [{ entityId: 't-1' }, { entityId: 't-2' }] });
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { tagIds: ['tag-a'] } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ id: { in: ['t-1', 't-2'] } });
    });

    it('adds id IN with empty array when tags match nothing (forces empty result)', async () => {
      const prisma = makePrisma({ tagRows: [] });
      const svc = makeSvc(prisma);
      const { where } = await svc.build(makeCtx({ filters: { tagIds: ['tag-a'] } }));
      const and = where.AND as Record<string, unknown>[];
      expect(and).toContainEqual({ id: { in: [] } });
    });

    it('passes correct entityType to tagAssignment query', async () => {
      const prisma = makePrisma({ tagRows: [{ entityId: 'x' }] });
      const svc = makeSvc(prisma);
      await svc.build(
        makeCtx({
          filters: { tagIds: ['tag-1'] },
          tableContext: { entityType: TaggableEntityType.LESSON },
        }),
      );
      expect(prisma.tagAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'LESSON' }),
        }),
      );
    });
  });

  describe('SHARED pre-query', () => {
    it('always calls contentShare.findMany', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      await svc.build(makeCtx());
      expect(prisma.contentShare.findMany).toHaveBeenCalledTimes(1);
    });

    it('queries contentShare with correct userId and entityType', async () => {
      const prisma = makePrisma();
      const svc = makeSvc(prisma);
      await svc.build(
        makeCtx({
          user: makeUser('user-abc'),
          tableContext: { entityType: TaggableEntityType.LESSON },
        }),
      );
      expect(prisma.contentShare.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sharedWithUserId: 'user-abc',
            entityType: 'LESSON',
            revokedAt: null,
          }),
        }),
      );
    });
  });
});
