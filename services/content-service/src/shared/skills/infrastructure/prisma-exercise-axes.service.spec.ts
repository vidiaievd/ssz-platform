jest.mock('../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaExerciseAxesService } from './prisma-exercise-axes.service.js';
import type { PrismaService } from '../../../infrastructure/database/prisma.service.js';

interface Rows {
  exercises?: unknown[];
  stages?: unknown[];
  videoQuestions?: unknown[];
  relations?: unknown[];
}

/**
 * A Prisma stand-in returning fixed rows.
 *
 * The service's job is not the SQL — it is turning four tables' worth of rows into the
 * shape the kernel derives from, including the two enum spellings Prisma hands back in
 * member-name form. That is what these tests pin.
 */
function prismaWith(rows: Rows): PrismaService {
  return {
    exercise: { findMany: () => Promise.resolve(rows.exercises ?? []) },
    lessonListeningStage: { findMany: () => Promise.resolve(rows.stages ?? []) },
    lessonVideoQuestion: { findMany: () => Promise.resolve(rows.videoQuestions ?? []) },
    contentRelation: { findMany: () => Promise.resolve(rows.relations ?? []) },
  } as unknown as PrismaService;
}

function exerciseRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ex-1',
    content: {},
    draftContent: null,
    draftUpdatedAt: null,
    skillsOverride: [],
    focusOverride: [],
    overrideSetAt: null,
    template: { code: 'short_answer' },
    ...over,
  };
}

describe('PrismaExerciseAxesService', () => {
  it('falls back to the template when nothing else has a say', async () => {
    const service = new PrismaExerciseAxesService(prismaWith({ exercises: [exerciseRow()] }));

    const axes = await service.forExercise('ex-1');

    expect(axes?.skillSource).toBe('template');
    expect(axes?.skills).toContain('written');
  });

  it('reads a listening stage as listening, whatever the template says', async () => {
    // The placement rung exists for exactly this: a short_answer about a recording is
    // not a reading exercise, and no flag inside its document would ever say so.
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow()],
        stages: [
          {
            exerciseId: 'ex-1',
            // Prisma hands back the enum member NAME, not its @map value.
            stageType: 'GAP_FILL',
            variant: { lesson: { kind: 'AUDIO' } },
          },
        ],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.skills).toEqual(['listening']);
    expect(axes?.skillSource).toBe('placement');
  });

  it('reads a video question as listening too', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow({ template: { code: 'multiple_choice' } })],
        videoQuestions: [{ exerciseId: 'ex-1', variant: { lesson: { kind: 'VIDEO' } } }],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.skills).toEqual(['listening']);
    expect(axes?.skillSource).toBe('placement');
  });

  it('lets the author overrule the placement', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [
          exerciseRow({
            skillsOverride: ['reading'],
            focusOverride: ['pragmatics'],
            overrideSetAt: new Date('2026-09-01T10:00:00.000Z'),
          }),
        ],
        stages: [
          {
            exerciseId: 'ex-1',
            stageType: 'COMPREHENSION',
            variant: { lesson: { kind: 'AUDIO' } },
          },
        ],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.skills).toEqual(['reading']);
    expect(axes?.focus).toEqual(['pragmatics']);
    expect(axes?.skillSource).toBe('override');
  });

  it('treats an override of two empty lists as a statement, not as silence', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow({ overrideSetAt: new Date('2026-09-01T10:00:00.000Z') })],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.skills).toEqual([]);
    expect(axes?.skillSource).toBe('override');
  });

  it('reads the subject off the atom graph', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow()],
        // Prisma spells these `GRAMMAR_RULE`; the kernel matches the mapped form.
        relations: [{ sourceType: 'GRAMMAR_RULE', sourceId: 'rule-1', targetId: 'ex-1' }],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.focus).toEqual(['grammar']);
    expect(axes?.focusSource).toBe('atoms');
  });

  it('reads the draft document only when one is waiting', async () => {
    // `word_bank_gap_fill` is the template whose document decides between typing from
    // nothing and picking from a strip, so an unpublished edit can genuinely move the
    // axis — which is the divergence the coverage report has to be able to name.
    const rows = {
      exercises: [
        exerciseRow({
          template: { code: 'word_bank_gap_fill' },
          content: { settings: { input: 'bank' } },
          draftContent: { settings: { input: 'free' } },
          draftUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        }),
      ],
    };

    const live = await new PrismaExerciseAxesService(prismaWith(rows)).forExercise('ex-1', 'live');
    const draft = await new PrismaExerciseAxesService(prismaWith(rows)).forExercise(
      'ex-1',
      'draft',
    );

    expect(live?.skills).toEqual(['reading']);
    expect(live?.form).toBe('bank');
    expect(draft?.skills).toEqual(['written']);
    expect(draft?.form).toBe('free');
  });

  it('counts an unedited exercise identically in both scopes', async () => {
    const rows = { exercises: [exerciseRow({ template: { code: 'multiple_choice' } })] };

    const live = await new PrismaExerciseAxesService(prismaWith(rows)).forExercise('ex-1', 'live');
    const draft = await new PrismaExerciseAxesService(prismaWith(rows)).forExercise(
      'ex-1',
      'draft',
    );

    expect(draft).toEqual(live);
  });

  it('leaves an id that resolves to nothing out of the answer', async () => {
    const service = new PrismaExerciseAxesService(prismaWith({ exercises: [exerciseRow()] }));

    const axes = await service.forExercises(['ex-1', 'deleted-one']);

    expect(axes.has('ex-1')).toBe(true);
    expect(axes.has('deleted-one')).toBe(false);
  });

  it('asks nothing of the database for an empty list', async () => {
    const service = new PrismaExerciseAxesService(
      // Any query at all would throw here.
      null as unknown as PrismaService,
    );

    await expect(service.forExercises([])).resolves.toEqual(new Map());
  });
});
