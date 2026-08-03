// Prevent Jest from loading the generated Prisma client (uses import.meta which
// breaks CommonJS transform). The repository receives PrismaService via injection.
jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaContainerItemRepository } from './prisma-container-item.repository.js';

const SOURCE_VERSION_ID = 'version-published';
const TARGET_VERSION_ID = 'version-draft';

interface SectionRow {
  id: string;
  title: string;
  position: number;
}

interface ItemRow {
  position: number;
  itemType: string;
  itemId: string;
  isRequired: boolean;
  sectionId: string | null;
  sectionLabel: string | null;
  xpReward: number | null;
}

function makeRepository(sections: SectionRow[], items: ItemRow[]) {
  const created: { sections?: SectionRow[]; items?: ItemRow[] } = {};

  const prisma = {
    containerSection: {
      findMany: jest.fn().mockResolvedValue(sections),
      createMany: jest.fn(({ data }: { data: SectionRow[] }) => {
        created.sections = data;
        return { __op: 'sections' };
      }),
    },
    containerItem: {
      findMany: jest.fn().mockResolvedValue(items),
      createMany: jest.fn(({ data }: { data: ItemRow[] }) => {
        created.items = data;
        return { __op: 'items' };
      }),
    },
    // The real client defers the calls until $transaction runs them; the stubs
    // above have already recorded their payloads by then.
    $transaction: jest.fn().mockResolvedValue([]),
  } as any;

  return { repo: new PrismaContainerItemRepository(prisma), prisma, created };
}

const SECTIONS: SectionRow[] = [
  { id: 'sec-vocab', title: 'Nye ord', position: 0 },
  { id: 'sec-text', title: 'Tekst', position: 1 },
];

const ITEMS: ItemRow[] = [
  {
    position: 0,
    itemType: 'VOCABULARY_LIST',
    itemId: 'voc-1',
    isRequired: true,
    sectionId: 'sec-vocab',
    sectionLabel: null,
    xpReward: null,
  },
  {
    position: 1,
    itemType: 'LESSON',
    itemId: 'lesson-1',
    isRequired: true,
    sectionId: 'sec-text',
    sectionLabel: null,
    xpReward: 10,
  },
  {
    position: 2,
    itemType: 'EXERCISE',
    itemId: 'exercise-1',
    isRequired: false,
    sectionId: null,
    sectionLabel: 'legacy label',
    xpReward: null,
  },
];

describe('PrismaContainerItemRepository.copyCompositionToVersion', () => {
  it("clones the source's sections onto the target version", async () => {
    const { repo, created } = makeRepository(SECTIONS, ITEMS);

    await repo.copyCompositionToVersion(SOURCE_VERSION_ID, TARGET_VERSION_ID);

    expect(created.sections).toHaveLength(2);
    expect(created.sections).toEqual([
      expect.objectContaining({
        containerVersionId: TARGET_VERSION_ID,
        title: 'Nye ord',
        position: 0,
      }),
      expect.objectContaining({
        containerVersionId: TARGET_VERSION_ID,
        title: 'Tekst',
        position: 1,
      }),
    ]);
  });

  it('repoints each copied item at the cloned section, not the source one', async () => {
    // Dropping the grouping here left the fresh draft ungrouped, which read as
    // "unpublished changes" forever and would ship a section-less version.
    const { repo, created } = makeRepository(SECTIONS, ITEMS);

    await repo.copyCompositionToVersion(SOURCE_VERSION_ID, TARGET_VERSION_ID);

    const sectionIdByTitle = new Map(
      (created.sections ?? []).map((s) => [s.title, (s as unknown as { id: string }).id]),
    );
    const items = created.items ?? [];

    expect(items[0]?.sectionId).toBe(sectionIdByTitle.get('Nye ord'));
    expect(items[1]?.sectionId).toBe(sectionIdByTitle.get('Tekst'));
    // Source ids must not leak into the target version.
    expect(items.map((i) => i.sectionId)).not.toContain('sec-vocab');
  });

  it('keeps an unsectioned item unsectioned', async () => {
    const { repo, created } = makeRepository(SECTIONS, ITEMS);

    await repo.copyCompositionToVersion(SOURCE_VERSION_ID, TARGET_VERSION_ID);

    expect(created.items?.[2]?.sectionId).toBeNull();
  });

  it('carries the per-item fields students see', async () => {
    const { repo, created } = makeRepository(SECTIONS, ITEMS);

    await repo.copyCompositionToVersion(SOURCE_VERSION_ID, TARGET_VERSION_ID);

    expect(created.items?.[1]).toEqual(
      expect.objectContaining({
        position: 1,
        itemType: 'LESSON',
        itemId: 'lesson-1',
        isRequired: true,
        xpReward: 10,
      }),
    );
    expect(created.items?.[2]).toEqual(
      expect.objectContaining({ isRequired: false, sectionLabel: 'legacy label' }),
    );
  });

  it('writes sections and items in one transaction', async () => {
    // A draft with items pointing at sections that were never committed would
    // be worse than no copy at all.
    const { repo, prisma } = makeRepository(SECTIONS, ITEMS);

    await repo.copyCompositionToVersion(SOURCE_VERSION_ID, TARGET_VERSION_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('does nothing when the source version is empty', async () => {
    const { repo, prisma } = makeRepository([], []);

    await repo.copyCompositionToVersion(SOURCE_VERSION_ID, TARGET_VERSION_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
