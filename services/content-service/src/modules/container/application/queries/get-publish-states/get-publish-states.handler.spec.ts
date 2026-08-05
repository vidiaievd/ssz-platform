// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The handler receives PrismaService via injection.
jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetPublishStatesHandler } from './get-publish-states.handler.js';
import { GetPublishStatesQuery } from './get-publish-states.query.js';
import type { PublishStateReader, ContainerPublishState } from '../../services/publish-state.reader.js';

const COURSE_ID = 'course-1';
const COURSE_DRAFT_ID = 'course-draft-1';

interface Fixture {
  states?: Record<string, ContainerPublishState>;
  /** Module container ids the course's draft version places. */
  moduleIds?: string[];
  /** Set false to model a course with no draft version at all. */
  hasDraft?: boolean;
}

function makeHandler(fixture: Fixture = {}) {
  const moduleIds = fixture.moduleIds ?? [];
  const hasDraft = fixture.hasDraft ?? true;

  const prisma = {
    containerVersion: {
      findMany: jest
        .fn()
        .mockResolvedValue(hasDraft ? [{ id: COURSE_DRAFT_ID, containerId: COURSE_ID }] : []),
    },
    containerItem: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          moduleIds.map((itemId) => ({ containerVersionId: COURSE_DRAFT_ID, itemId })),
        ),
    },
  } as any;

  const publishStateReader = {
    resolve: jest
      .fn()
      .mockResolvedValue(
        new Map(Object.entries(fixture.states ?? { [COURSE_ID]: 'published' })),
      ),
  } as unknown as PublishStateReader;

  return {
    handler: new GetPublishStatesHandler(prisma, publishStateReader),
    publishStateReader,
  };
}

describe('GetPublishStatesHandler', () => {
  it('reports a container that is live and up to date', async () => {
    const { handler } = makeHandler();

    const [summary] = await handler.execute(new GetPublishStatesQuery([COURSE_ID]));

    expect(summary).toEqual({
      containerId: COURSE_ID,
      publishState: 'published',
      pendingModuleCount: 0,
    });
  });

  it('counts modules students cannot open inside an up-to-date course', async () => {
    // Modules are versioned independently and publishing does not cascade, so
    // a course can be perfectly current while holding material nobody can see.
    const { handler } = makeHandler({
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      states: {
        [COURSE_ID]: 'published',
        'mod-1': 'published',
        'mod-2': 'pending_changes',
        'mod-3': 'draft',
      },
    });

    const [summary] = await handler.execute(new GetPublishStatesQuery([COURSE_ID]));

    expect(summary?.publishState).toBe('published');
    expect(summary?.pendingModuleCount).toBe(2);
  });

  it('asks for the containers and their modules in one pass', async () => {
    const { handler, publishStateReader } = makeHandler({ moduleIds: ['mod-1'] });

    await handler.execute(new GetPublishStatesQuery([COURSE_ID]));

    expect(publishStateReader.resolve).toHaveBeenCalledTimes(1);
    expect(publishStateReader.resolve).toHaveBeenCalledWith([COURSE_ID, 'mod-1']);
  });

  it('treats a container the reader says nothing about as a draft', async () => {
    const { handler } = makeHandler({ states: {} });

    const [summary] = await handler.execute(new GetPublishStatesQuery([COURSE_ID]));

    expect(summary?.publishState).toBe('draft');
  });

  it('counts no modules for a course with no draft version', async () => {
    const { handler } = makeHandler({ hasDraft: false, moduleIds: ['mod-1'] });

    const [summary] = await handler.execute(new GetPublishStatesQuery([COURSE_ID]));

    expect(summary?.pendingModuleCount).toBe(0);
  });

  it('returns nothing for no ids, without touching the database', async () => {
    const { handler, publishStateReader } = makeHandler();

    expect(await handler.execute(new GetPublishStatesQuery([]))).toEqual([]);
    expect(publishStateReader.resolve).not.toHaveBeenCalled();
  });
});
