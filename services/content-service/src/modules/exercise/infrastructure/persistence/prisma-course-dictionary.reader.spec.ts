jest.mock('../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaCourseDictionaryReader } from './prisma-course-dictionary.reader.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

// An in-memory course, shaped as the walk reads it. The SQL is not under test — the walk is:
// which course, which versions, which lists, in what order and under what heading.

interface Container {
  id: string;
  containerType: 'COURSE' | 'MODULE';
  title: string;
  deletedAt: Date | null;
  currentPublishedVersionId: string | null;
}
interface Version {
  id: string;
  containerId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  versionNumber: number;
}
interface Item {
  id: string;
  containerVersionId: string;
  itemType: 'CONTAINER' | 'VOCABULARY_LIST' | 'EXERCISE';
  itemId: string;
  position: number;
  section: { title: string; position: number } | null;
}
interface Word {
  id: string;
  word: string;
  vocabularyListId: string;
  position: number;
  partOfSpeech: string | null;
  grammaticalProperties: unknown;
  deletedAt: Date | null;
  listDeleted?: boolean;
  translations: Array<{ translationLanguage: string; primaryTranslation: string }>;
}

interface World {
  containers: Container[];
  versions: Version[];
  items: Item[];
  words: Word[];
}

function prismaOver(world: World): PrismaService {
  const containerOf = (versionId: string) => {
    const v = world.versions.find((x) => x.id === versionId)!;
    return world.containers.find((c) => c.id === v.containerId)!;
  };
  const matchesType = (t: string, want: unknown) =>
    typeof want === 'string' ? t === want : (want as { in: string[] }).in.includes(t);
  return {
    containerItem: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          world.items
            .filter(
              (i) =>
                (where['itemId'] === undefined || i.itemId === where['itemId']) &&
                (where['containerVersionId'] === undefined ||
                  i.containerVersionId === where['containerVersionId']) &&
                (where['itemType'] === undefined || matchesType(i.itemType, where['itemType'])),
            )
            .sort((a, b) => a.position - b.position)
            .map((i) => ({
              ...i,
              containerVersion: { container: containerOf(i.containerVersionId) },
            })),
        ),
      findFirst: ({ where }: { where: { containerVersionId: string; itemId: string } }) =>
        Promise.resolve(
          world.items.find(
            (i) => i.containerVersionId === where.containerVersionId && i.itemId === where.itemId,
          ) ?? null,
        ),
    },
    container: {
      findFirst: ({ where }: { where: { id: string; deletedAt?: null } }) =>
        Promise.resolve(
          world.containers.find(
            (c) => c.id === where.id && (where.deletedAt === undefined || c.deletedAt === null),
          ) ?? null,
        ),
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          world.containers.filter((c) => where.id.in.includes(c.id) && c.deletedAt === null),
        ),
    },
    containerVersion: {
      findFirst: ({ where }: { where: { containerId: string; status: string } }) =>
        Promise.resolve(
          world.versions
            .filter((v) => v.containerId === where.containerId && v.status === where.status)
            .sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null,
        ),
    },
    vocabularyItem: {
      findMany: ({
        where,
      }: {
        where: { vocabularyListId: { in: string[] }; partOfSpeech?: string };
      }) =>
        Promise.resolve(
          world.words.filter(
            (w) =>
              where.vocabularyListId.in.includes(w.vocabularyListId) &&
              w.deletedAt === null &&
              !w.listDeleted &&
              (where.partOfSpeech === undefined || w.partOfSpeech === where.partOfSpeech),
          ),
        ),
    },
  } as unknown as PrismaService;
}

const container = (
  id: string,
  containerType: Container['containerType'],
  title: string,
  published: string | null,
): Container => ({
  id,
  containerType,
  title,
  deletedAt: null,
  currentPublishedVersionId: published,
});
let itemSeq = 0;
const item = (
  containerVersionId: string,
  itemType: Item['itemType'],
  itemId: string,
  position: number,
  section: Item['section'] = null,
): Item => ({
  id: `ci-${(itemSeq += 1)}`,
  containerVersionId,
  itemType,
  itemId,
  position,
  section,
});
const word = (
  id: string,
  w: string,
  list: string,
  position: number,
  pos: string,
  props: unknown = {},
  translations: Word['translations'] = [
    { translationLanguage: 'en', primaryTranslation: `${w}-en` },
  ],
): Word => ({
  id,
  word: w,
  vocabularyListId: list,
  position,
  partOfSpeech: pos,
  grammaticalProperties: props,
  deletedAt: null,
  translations,
});

/**
 * Course C (draft cv-d) places module M9 under section «B1» and module M2 unsectioned, and a list
 * of its own under «B1». M9 has a draft (with the exercise) and an older published version; M2 has
 * only a published one. The exercise sits in M9's draft.
 */
function world(): World {
  return {
    containers: [
      container('C', 'COURSE', 'Norsk B1', 'cv-p'),
      container('M9', 'MODULE', 'Leksjon 9', 'm9-p'),
      container('M2', 'MODULE', 'Leksjon 2', 'm2-p'),
    ],
    versions: [
      { id: 'cv-p', containerId: 'C', status: 'PUBLISHED', versionNumber: 1 },
      { id: 'cv-d', containerId: 'C', status: 'DRAFT', versionNumber: 2 },
      { id: 'm9-p', containerId: 'M9', status: 'PUBLISHED', versionNumber: 1 },
      { id: 'm9-d', containerId: 'M9', status: 'DRAFT', versionNumber: 2 },
      { id: 'm2-p', containerId: 'M2', status: 'PUBLISHED', versionNumber: 1 },
    ],
    items: [
      item('cv-d', 'CONTAINER', 'M2', 2),
      item('cv-d', 'CONTAINER', 'M9', 1, { title: 'B1', position: 0 }),
      item('cv-d', 'VOCABULARY_LIST', 'L-course', 0, { title: 'B1', position: 0 }),
      item('m9-d', 'EXERCISE', 'ex-1', 0),
      item('m9-d', 'VOCABULARY_LIST', 'L9', 1),
      // The old published version of M9 had another list; the editor shows the draft.
      item('m9-p', 'VOCABULARY_LIST', 'L9-old', 0),
      item('m2-p', 'VOCABULARY_LIST', 'L2', 0),
    ],
    words: [
      word('w-bok', 'bok', 'L9', 1, 'NOUN', { gender: 'feminine', definite_singular: 'boka' }, [
        { translationLanguage: 'en', primaryTranslation: 'book' },
        { translationLanguage: 'uk', primaryTranslation: 'книга' },
      ]),
      word('w-hus', 'hus', 'L9', 0, 'NOUN', { gender: 'neuter' }),
      word('w-soke', 'søke', 'L9', 2, 'VERB', { past_tense: 'søkte' }),
      word('w-jobb', 'jobb', 'L2', 0, 'NOUN'),
      word('w-stor', 'stor', 'L-course', 0, 'ADJECTIVE'),
      word('w-old', 'gammel', 'L9-old', 0, 'ADJECTIVE'),
    ],
  };
}

const read = (
  w: World,
  options: Parameters<PrismaCourseDictionaryReader['forExercise']>[1] = {},
  exerciseId = 'ex-1',
) => new PrismaCourseDictionaryReader(prismaOver(w)).forExercise(exerciseId, options);

describe('PrismaCourseDictionaryReader', () => {
  it("reads every list of the exercise's course, in course order, from each draft", async () => {
    const entries = await read(world());
    // Section «B1» first (its list, then M9 by position), the unsectioned M2 after; within a list
    // by position. M9's old published list is not read: it has a draft.
    expect(entries.map((e) => e.word)).toEqual(['stor', 'hus', 'bok', 'søke', 'jobb']);
  });

  it('says where each word is introduced', async () => {
    const unit = Object.fromEntries((await read(world())).map((e) => [e.word, e.unit]));
    expect(unit).toEqual({
      stor: 'B1',
      hus: 'B1 · Leksjon 9',
      bok: 'B1 · Leksjon 9',
      søke: 'B1 · Leksjon 9',
      jobb: 'Leksjon 2',
    });
  });

  it("filters by the paradigm's part of speech", async () => {
    expect((await read(world(), { pos: 'VERB' })).map((e) => e.word)).toEqual(['søke']);
  });

  it('returns each entry as stored, with the gloss in the asked language, else English', async () => {
    const [bok] = (await read(world(), { pos: 'NOUN', glossLanguage: 'uk' })).filter(
      (e) => e.word === 'bok',
    );
    expect(bok).toEqual({
      id: 'w-bok',
      word: 'bok',
      pos: 'NOUN',
      gloss: 'книга',
      unit: 'B1 · Leksjon 9',
      properties: { gender: 'feminine', definite_singular: 'boka' },
    });
    const hus = (await read(world(), { glossLanguage: 'ru' })).find((e) => e.word === 'hus');
    expect(hus?.gloss).toBe('hus-en');
  });

  it('leaves out deleted words, words of deleted lists and deleted modules', async () => {
    const w = world();
    w.words.find((x) => x.word === 'hus')!.deletedAt = new Date();
    w.words.find((x) => x.word === 'stor')!.listDeleted = true;
    w.containers.find((c) => c.id === 'M2')!.deletedAt = new Date();
    expect((await read(w)).map((e) => e.word)).toEqual(['bok', 'søke']);
  });

  it('falls back to a published version where a container has no draft', async () => {
    const w = world();
    w.versions = w.versions.filter((v) => v.id !== 'cv-d');
    w.items = w.items.filter((i) => i.containerVersionId !== 'cv-d');
    // The published course version places only M9.
    w.items.push(item('cv-p', 'CONTAINER', 'M9', 0));
    expect((await read(w)).map((e) => e.unit)).toEqual(['Leksjon 9', 'Leksjon 9', 'Leksjon 9']);
  });

  it("reads a module's own lists when no course places it", async () => {
    const w = world();
    w.items = w.items.filter((i) => i.containerVersionId !== 'cv-d');
    expect((await read(w)).map((e) => [e.word, e.unit])).toEqual([
      ['hus', 'Leksjon 9'],
      ['bok', 'Leksjon 9'],
      ['søke', 'Leksjon 9'],
    ]);
  });

  it('answers an empty list for an exercise in no container, or a course with no dictionary', async () => {
    expect(await read(world(), {}, 'ex-nowhere')).toEqual([]);
    const w = world();
    w.items = w.items.filter((i) => i.itemType !== 'VOCABULARY_LIST');
    expect(await read(w)).toEqual([]);
  });

  it('ignores a module version the exercise has since left', async () => {
    const w = world();
    // The exercise moved out of M9's draft; only the old published version still holds it.
    w.items = w.items.filter((i) => !(i.itemType === 'EXERCISE'));
    w.items.push(item('m9-p', 'EXERCISE', 'ex-1', 1));
    expect(await read(w)).toEqual([]);
  });
});
