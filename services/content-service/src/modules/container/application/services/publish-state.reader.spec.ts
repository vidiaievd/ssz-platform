// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The reader receives PrismaService via injection.
jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PublishStateReader } from './publish-state.reader.js';

const COURSE_ID = 'course-1';
const PUBLISHED_VERSION_ID = 'version-published';
const DRAFT_VERSION_ID = 'version-draft';

interface PrismaFixture {
  currentPublishedVersionId?: string | null;
  drafts?: { id: string; containerId: string; versionNumber: number }[];
  items?: {
    containerVersionId: string;
    position: number;
    itemType: string;
    itemId: string;
    isRequired: boolean;
    sectionId: string | null;
  }[];
  sections?: { id: string; title: string }[];
}

function makeReader(fixture: PrismaFixture = {}) {
  const prisma = {
    container: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: COURSE_ID,
          currentPublishedVersionId:
            fixture.currentPublishedVersionId === undefined
              ? PUBLISHED_VERSION_ID
              : fixture.currentPublishedVersionId,
        },
      ]),
    },
    containerVersion: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          fixture.drafts ?? [{ id: DRAFT_VERSION_ID, containerId: COURSE_ID, versionNumber: 2 }],
        ),
    },
    containerItem: { findMany: jest.fn().mockResolvedValue(fixture.items ?? []) },
    containerSection: { findMany: jest.fn().mockResolvedValue(fixture.sections ?? []) },
  } as any;

  return new PublishStateReader(prisma);
}

function item(versionId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    containerVersionId: versionId,
    position: 0,
    itemType: 'LESSON',
    itemId: 'lesson-1',
    isRequired: true,
    sectionId: null,
    ...overrides,
  };
}

describe('PublishStateReader', () => {
  it('returns an empty map for no ids without touching the database', async () => {
    const reader = makeReader();
    await expect(reader.resolve([])).resolves.toEqual(new Map());
  });

  it('reports draft when the container was never published', async () => {
    const reader = makeReader({ currentPublishedVersionId: null });

    const states = await reader.resolve([COURSE_ID]);

    expect(states.get(COURSE_ID)).toBe('draft');
  });

  it('reports published when there is no draft version at all', async () => {
    const reader = makeReader({ drafts: [] });

    const states = await reader.resolve([COURSE_ID]);

    expect(states.get(COURSE_ID)).toBe('published');
  });

  it('reports published when the draft holds the same composition', async () => {
    const reader = makeReader({
      items: [item(PUBLISHED_VERSION_ID), item(DRAFT_VERSION_ID)],
    });

    const states = await reader.resolve([COURSE_ID]);

    expect(states.get(COURSE_ID)).toBe('published');
  });

  it('reports pending_changes when the draft gained an item', async () => {
    const reader = makeReader({
      items: [
        item(PUBLISHED_VERSION_ID),
        item(DRAFT_VERSION_ID),
        item(DRAFT_VERSION_ID, { position: 1, itemId: 'lesson-2' }),
      ],
    });

    const states = await reader.resolve([COURSE_ID]);

    expect(states.get(COURSE_ID)).toBe('pending_changes');
  });

  it('reports pending_changes when an item moved to another section', async () => {
    const reader = makeReader({
      items: [
        item(PUBLISHED_VERSION_ID, { sectionId: 'sec-published' }),
        item(DRAFT_VERSION_ID, { sectionId: 'sec-draft' }),
      ],
      sections: [
        { id: 'sec-published', title: 'Read' },
        { id: 'sec-draft', title: 'Practise' },
      ],
    });

    const states = await reader.resolve([COURSE_ID]);

    expect(states.get(COURSE_ID)).toBe('pending_changes');
  });

  it('ignores section ids that differ while the grouping is identical', async () => {
    const reader = makeReader({
      items: [
        item(PUBLISHED_VERSION_ID, { sectionId: 'sec-published' }),
        item(DRAFT_VERSION_ID, { sectionId: 'sec-draft' }),
      ],
      sections: [
        { id: 'sec-published', title: 'Read' },
        { id: 'sec-draft', title: 'Read' },
      ],
    });

    const states = await reader.resolve([COURSE_ID]);

    expect(states.get(COURSE_ID)).toBe('published');
  });

  it('omits ids that do not resolve to a container', async () => {
    const reader = makeReader({ drafts: [] });

    const states = await reader.resolve([COURSE_ID, 'ghost']);

    expect(states.has('ghost')).toBe(false);
  });
});
