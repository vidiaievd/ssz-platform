// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The handler receives PrismaService via injection.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetContainerActivityHandler } from './get-container-activity.handler.js';
import { GetContainerActivityQuery } from './get-container-activity.query.js';

const CONTAINER_ID = 'course-1';
const EXERCISE_ID = 'exercise-1';

interface AuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  changedFields: string[];
  occurredAt: Date;
}

interface Fixture {
  versions?: { id: string }[];
  items?: { itemId: string }[];
  rows?: AuditRow[];
  exerciseTemplateName?: string | null;
}

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 'entry-1',
    entityType: 'EXERCISE',
    entityId: EXERCISE_ID,
    action: 'updated',
    actorUserId: 'user-1',
    changedFields: ['content'],
    occurredAt: new Date('2026-08-07T09:00:00.000Z'),
    ...overrides,
  };
}

function makeHandler(fixture: Fixture = {}) {
  const auditFindMany = jest.fn().mockResolvedValue(fixture.rows ?? []);

  const prisma = {
    containerVersion: {
      findMany: jest.fn().mockResolvedValue(fixture.versions ?? [{ id: 'version-1' }]),
    },
    containerItem: {
      findMany: jest.fn().mockResolvedValue(fixture.items ?? [{ itemId: EXERCISE_ID }]),
    },
    contentAuditLog: { findMany: auditFindMany },
    container: { findMany: jest.fn().mockResolvedValue([]) },
    lesson: { findMany: jest.fn().mockResolvedValue([]) },
    vocabularyList: { findMany: jest.fn().mockResolvedValue([]) },
    grammarRule: { findMany: jest.fn().mockResolvedValue([]) },
    exercise: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          fixture.exerciseTemplateName === undefined
            ? [{ id: EXERCISE_ID, template: { name: 'Gap-Fill' } }]
            : [{ id: EXERCISE_ID, template: { name: fixture.exerciseTemplateName } }],
        ),
    },
  } as never;

  return { handler: new GetContainerActivityHandler(prisma), auditFindMany };
}

describe('GetContainerActivityHandler', () => {
  it('names the entity an entry is about', async () => {
    const { handler } = makeHandler({ rows: [row()] });

    const result = await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 30));

    expect(result.entries[0]?.entityTitle).toBe('Gap-Fill');
    expect(result.entries[0]?.changedFields).toEqual(['content']);
  });

  it('leaves the title null when the entity is gone', async () => {
    // A deleted exercise still has history, and dropping the entry would hide
    // the deletion itself from the feed that is supposed to report it.
    const { handler } = makeHandler({ rows: [row()], exerciseTemplateName: null });

    const result = await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 30));

    expect(result.entries[0]?.entityTitle).toBeNull();
  });

  it('asks for one row beyond the page to answer hasMore', async () => {
    const { handler, auditFindMany } = makeHandler({
      rows: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })],
    });

    const result = await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 2));

    expect(auditFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    expect(result.entries).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('reports no more pages when the extra row does not come back', async () => {
    const { handler } = makeHandler({ rows: [row()] });

    const result = await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 30));

    expect(result.hasMore).toBe(false);
  });

  it('looks for the container itself as well as the material it places', async () => {
    const { handler, auditFindMany } = makeHandler({ rows: [] });

    await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 30));

    expect(auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { entityType: 'CONTAINER', entityId: CONTAINER_ID },
            { entityId: { in: [EXERCISE_ID] } },
          ],
        }),
      }),
    );
  });

  it('pages backwards from the cursor', async () => {
    const before = new Date('2026-08-07T08:00:00.000Z');
    const { handler, auditFindMany } = makeHandler({ rows: [] });

    await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 30, before));

    expect(auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ occurredAt: { lt: before } }),
      }),
    );
  });

  it('reads nothing for a container with no versions', async () => {
    const { handler } = makeHandler({ versions: [], rows: [] });

    const result = await handler.execute(new GetContainerActivityQuery(CONTAINER_ID, 30));

    expect(result.entries).toEqual([]);
  });
});
