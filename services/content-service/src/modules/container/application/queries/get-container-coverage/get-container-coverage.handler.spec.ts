jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetContainerCoverageHandler } from './get-container-coverage.handler.js';
import { GetContainerCoverageQuery } from './get-container-coverage.query.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

interface ContainerFixture {
  id: string;
  title: string;
  containerType: string;
  currentPublishedVersionId: string | null;
  draftVersionId?: string | null;
}

interface VariantFixture {
  status: 'DRAFT' | 'PUBLISHED';
  listeningStages: string[];
  videoQuestion?: string;
}

interface Fixture {
  containers: Record<string, ContainerFixture>;
  items: Record<string, Array<{ itemType: string; itemId: string }>>;
  lessons?: Record<string, VariantFixture[]>;
}

function prismaFrom(fixture: Fixture): PrismaService {
  return {
    container: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(fixture.containers[where.id] ?? null),
    },
    containerVersion: {
      findFirst: ({ where }: { where: { containerId: string } }) => {
        const draftId = fixture.containers[where.containerId]?.draftVersionId ?? null;
        return Promise.resolve(draftId === null ? null : { id: draftId });
      },
    },
    containerItem: {
      findMany: ({ where }: { where: { containerVersionId: string } }) =>
        Promise.resolve(fixture.items[where.containerVersionId] ?? []),
    },
    lessonContentVariant: {
      findMany: ({ where }: { where: { lessonId: string; status?: string } }) => {
        const variants = fixture.lessons?.[where.lessonId] ?? [];
        const kept = where.status ? variants.filter((v) => v.status === where.status) : variants;
        return Promise.resolve(
          kept.map((v) => ({
            listeningStages: v.listeningStages.map((exerciseId) => ({ exerciseId })),
            videoQuestion: v.videoQuestion ? { exerciseId: v.videoQuestion } : null,
          })),
        );
      },
    },
  } as unknown as PrismaService;
}

const READING = {
  skills: ['reading'],
  focus: [],
  form: 'bank',
  skillSource: 'template',
  focusSource: 'unknown',
};
const WRITTEN = {
  skills: ['written'],
  focus: ['grammar'],
  form: 'free',
  skillSource: 'template',
  focusSource: 'atoms',
};
const LISTENING = {
  skills: ['listening'],
  focus: [],
  form: 'free',
  skillSource: 'placement',
  focusSource: 'unknown',
};

/** Axes by exercise id, optionally answering differently in the draft scope. */
function axesFrom(
  live: Record<string, unknown>,
  draft: Record<string, unknown> = live,
): IExerciseAxes {
  return {
    forExercise: () => Promise.resolve(null),
    forExercises: (ids: readonly string[], scope = 'live') => {
      const table = scope === 'draft' ? draft : live;
      const out = new Map<string, unknown>();
      for (const id of ids) if (table[id]) out.set(id, table[id]);
      return Promise.resolve(out);
    },
  } as unknown as IExerciseAxes;
}

const COURSE: Fixture = {
  containers: {
    'course-1': {
      id: 'course-1',
      title: 'Ny i Norge B1',
      containerType: 'COURSE',
      currentPublishedVersionId: 'cv-course',
    },
    'module-1': {
      id: 'module-1',
      title: 'Leksjon 1',
      containerType: 'MODULE',
      currentPublishedVersionId: 'cv-m1',
    },
    'module-2': {
      id: 'module-2',
      title: 'Leksjon 2',
      containerType: 'MODULE',
      currentPublishedVersionId: 'cv-m2',
    },
  },
  items: {
    'cv-course': [
      { itemType: 'CONTAINER', itemId: 'module-1' },
      { itemType: 'CONTAINER', itemId: 'module-2' },
    ],
    'cv-m1': [
      { itemType: 'EXERCISE', itemId: 'ex-a' },
      { itemType: 'EXERCISE', itemId: 'ex-b' },
    ],
    'cv-m2': [{ itemType: 'EXERCISE', itemId: 'ex-c' }],
  },
};

const AXES = axesFrom({ 'ex-a': READING, 'ex-b': READING, 'ex-c': WRITTEN });

describe('GetContainerCoverageHandler', () => {
  it('rolls the whole tree up, and the modules add up to it', async () => {
    const handler = new GetContainerCoverageHandler(prismaFrom(COURSE), AXES);

    const result = await handler.execute(new GetContainerCoverageQuery('course-1', 'draft'));

    const report = result.value.draft!;
    expect(report.coverage.total).toBe(3);
    expect(report.coverage.bySkill).toEqual({ listening: 0, reading: 2, spoken: 0, written: 1 });

    const summed = report.modules.reduce((n, module) => n + module.coverage.total, 0);
    expect(summed).toBe(report.coverage.total);
    expect(report.modules.map((m) => m.title)).toEqual(['Leksjon 1', 'Leksjon 2']);
  });

  it('prints the zeroes instead of dropping them', async () => {
    // "This course has no listening" is the single most useful sentence the report can
    // say, and it looks exactly like a missing key if the empty cells are skipped.
    const handler = new GetContainerCoverageHandler(prismaFrom(COURSE), AXES);

    const result = await handler.execute(new GetContainerCoverageQuery('course-1', 'draft'));

    expect(result.value.draft!.coverage.emptySkills).toEqual(['listening', 'spoken']);
    expect(result.value.draft!.coverage.byForm.mixed).toBe(0);
  });

  it('counts the exercises bolted onto a lesson, not only those placed beside it', async () => {
    // The listening stages of an audio lesson are precisely the listening exercises. A
    // report that walked only ContainerItem rows would announce `listening: 0` for a
    // course built entirely out of audio lessons.
    const fixture: Fixture = {
      containers: {
        'module-1': {
          id: 'module-1',
          title: 'Lytting',
          containerType: 'MODULE',
          currentPublishedVersionId: 'cv-m1',
        },
      },
      items: { 'cv-m1': [{ itemType: 'LESSON', itemId: 'lesson-1' }] },
      lessons: {
        'lesson-1': [
          { status: 'PUBLISHED', listeningStages: ['ex-l1', 'ex-l2'] },
          // A second variant of the same lesson places the same exercises; counting it
          // twice would inflate every multilingual course.
          { status: 'PUBLISHED', listeningStages: ['ex-l1', 'ex-l2'] },
        ],
      },
    };
    const handler = new GetContainerCoverageHandler(
      prismaFrom(fixture),
      axesFrom({ 'ex-l1': LISTENING, 'ex-l2': LISTENING }),
    );

    const result = await handler.execute(new GetContainerCoverageQuery('module-1', 'draft'));

    expect(result.value.draft!.coverage.total).toBe(2);
    expect(result.value.draft!.coverage.bySkill.listening).toBe(2);
  });

  it('says a course has no published coverage rather than reporting it as empty', async () => {
    const fixture: Fixture = {
      containers: {
        'course-1': {
          id: 'course-1',
          title: 'Utkast',
          containerType: 'COURSE',
          currentPublishedVersionId: null,
          draftVersionId: 'cv-draft',
        },
      },
      items: { 'cv-draft': [{ itemType: 'EXERCISE', itemId: 'ex-a' }] },
    };
    const handler = new GetContainerCoverageHandler(
      prismaFrom(fixture),
      axesFrom({ 'ex-a': READING }),
    );

    const result = await handler.execute(new GetContainerCoverageQuery('course-1', 'both'));

    expect(result.value.published!.available).toBe(false);
    expect(result.value.draft!.available).toBe(true);
    // Nothing published is not a disagreement between two versions.
    expect(result.value.diverges).toBe(false);
  });

  it('reports no divergence when nothing is waiting to be released', async () => {
    const handler = new GetContainerCoverageHandler(prismaFrom(COURSE), AXES);

    const result = await handler.execute(new GetContainerCoverageQuery('course-1', 'both'));

    expect(result.value.diverges).toBe(false);
    expect(result.value.differences).toEqual([]);
  });

  it('names the cells an unreleased edit moved', async () => {
    // An edit to `settings.input` turns picking from a strip into typing from nothing —
    // the draft trains a different channel from the one learners are being served.
    const fixture: Fixture = {
      containers: {
        'module-1': {
          id: 'module-1',
          title: 'Leksjon 1',
          containerType: 'MODULE',
          currentPublishedVersionId: 'cv-m1',
        },
      },
      items: { 'cv-m1': [{ itemType: 'EXERCISE', itemId: 'ex-a' }] },
    };
    const handler = new GetContainerCoverageHandler(
      prismaFrom(fixture),
      axesFrom({ 'ex-a': READING }, { 'ex-a': WRITTEN }),
    );

    const result = await handler.execute(new GetContainerCoverageQuery('module-1', 'both'));

    expect(result.value.diverges).toBe(true);
    expect(result.value.differences).toEqual(
      expect.arrayContaining([
        { axis: 'skill', key: 'reading', draft: 0, published: 1 },
        { axis: 'skill', key: 'written', draft: 1, published: 0 },
      ]),
    );
  });

  it('survives a container placed inside itself', async () => {
    const fixture: Fixture = {
      containers: {
        'module-1': {
          id: 'module-1',
          title: 'Sirkel',
          containerType: 'MODULE',
          currentPublishedVersionId: 'cv-m1',
        },
      },
      items: { 'cv-m1': [{ itemType: 'CONTAINER', itemId: 'module-1' }] },
    };
    const handler = new GetContainerCoverageHandler(prismaFrom(fixture), axesFrom({}));

    const result = await handler.execute(new GetContainerCoverageQuery('module-1', 'draft'));

    expect(result.value.draft!.coverage.total).toBe(0);
  });

  it('refuses a container that is not there', async () => {
    const handler = new GetContainerCoverageHandler(
      prismaFrom({ containers: {}, items: {} }),
      axesFrom({}),
    );

    const result = await handler.execute(new GetContainerCoverageQuery('gone', 'draft'));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
  });
});
