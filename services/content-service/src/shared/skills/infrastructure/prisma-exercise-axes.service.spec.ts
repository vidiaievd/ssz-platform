jest.mock('../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { PrismaExerciseAxesService } from './prisma-exercise-axes.service.js';
import type { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { sampleContent, toContent, toExpectedAnswers } from '@ssz/shared-kernel/inflection-table';

interface Rows {
  exercises?: unknown[];
  stages?: unknown[];
  videoQuestions?: unknown[];
  relations?: unknown[];
  /** `ExerciseItemTarget` rows — what an exercise is about, element by element. */
  targets?: unknown[];
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
    exerciseItemTarget: { findMany: () => Promise.resolve(rows.targets ?? []) },
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
    // not a reading exercise, and no flag inside its document would ever say so. It is
    // still written, though: the recording replaces the input, not the answer (plan 64,
    // decision F).
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

    expect(axes?.skills).toEqual(['listening', 'written']);
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

  // Plan 64, decision H: the element key is what turns a subject into a share.
  it('reads the subject element by element where the catalogue says so', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow({ template: { code: 'multiple_choice' } })],
        targets: [
          // Prisma hands back the enum member NAME here too.
          { exerciseId: 'ex-1', itemKey: 'q1', atomType: 'VOCABULARY_ITEM', atomId: 'v-1' },
          { exerciseId: 'ex-1', itemKey: 'q2', atomType: 'GRAMMAR_RULE_ATOM', atomId: 'g-1' },
          { exerciseId: 'ex-1', itemKey: 'q3', atomType: 'GRAMMAR_RULE_ATOM', atomId: 'g-2' },
        ],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.focusSource).toBe('atoms');
    expect(axes?.focusWeights.vocabulary).toBeCloseTo(1 / 3);
    expect(axes?.focusWeights.grammar).toBeCloseTo(2 / 3);
  });

  // Most of the catalogue has never been addressed, and the older graph still
  // knows what those exercises are about.
  it('falls back to the relation graph for an exercise nobody has addressed', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow()],
        relations: [{ sourceType: 'GRAMMAR_RULE', sourceId: 'r-1', targetId: 'ex-1' }],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.focus).toEqual(['grammar']);
    expect(axes?.focusSource).toBe('atoms');
    // One statement about the whole exercise, whatever it is made of.
    expect(axes?.focusWeights).toEqual({ grammar: 1 });
  });

  // An addressed exercise is addressed: weighing its leftover relation rows as
  // elements would count rows nobody wrote as elements.
  it('does not mix the two graphs for one exercise', async () => {
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [exerciseRow()],
        targets: [
          { exerciseId: 'ex-1', itemKey: 'q1', atomType: 'VOCABULARY_ITEM', atomId: 'v-1' },
        ],
        relations: [{ sourceType: 'GRAMMAR_RULE', sourceId: 'r-1', targetId: 'ex-1' }],
      }),
    );

    const axes = await service.forExercise('ex-1');

    expect(axes?.focus).toEqual(['vocabulary']);
    expect(axes?.focusWeights).toEqual({ vocabulary: 1 });
  });

  it("takes the words an inflection table's dictionary rows address without a target row (plan 69, Q1-B)", async () => {
    const doc = sampleContent();
    // Two of the four rows come from the dictionary.
    const table = {
      ...doc,
      rows: doc.rows.map((r) => ({
        ...r,
        dictId: ['r1', 'r2'].includes(r.id) ? `w-${r.id}` : null,
      })),
    };
    const service = new PrismaExerciseAxesService(
      prismaWith({
        exercises: [
          exerciseRow({
            content: toContent(table),
            expectedAnswers: toExpectedAnswers(table),
            draftExpectedAnswers: null,
            template: { code: 'inflection_table' },
          }),
        ],
      }),
    );

    const axes = await service.forExercise('ex-1');

    // The structural grammar hint joins the words. Shares are over the addressed cells only (the
    // kernel's rule), and every one of those is about its word and its rule.
    expect(axes?.focusSource).toBe('atoms');
    expect(axes?.focus).toEqual(['vocabulary', 'grammar']);
    expect(axes?.focusWeights.vocabulary).toBeCloseTo(1);
    expect(axes?.focusWeights.grammar).toBeCloseTo(1);
  });
});
