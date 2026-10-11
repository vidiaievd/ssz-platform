import { jest } from '@jest/globals';
import {
  SAMPLE_ANSWERS,
  SAMPLE_FIELD_IDS,
  sampleContent,
  toContent,
  toExpectedAnswers,
  toStudentProjection,
} from '@ssz/shared-kernel/information-transfer';
import type { InformationTransferContent, Memory } from '@ssz/shared-kernel/information-transfer';
import { withStudentAudio } from '@ssz/shared-kernel/audio';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import type { StartAttemptResult } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { SubmitAnswerHandler } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { InformationTransferValidator } from '../../../src/infrastructure/validation/validators/information-transfer.validator.js';
import type { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import type { ExerciseDefinition } from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 73 phase 4 — an `information_transfer` blank through the engine: the projection at the
// start in both modes, what the attempt snapshots for memory, the blank checked whole and left
// open, a reload handed the check it ended on, and the one event. The handlers are the real ones;
// the repository is in memory, content-service a stub.

const USER = 'user-1';
const EXERCISE = 'ex-1';
const [DATO, KLOKKE, ROM, PRIS, TLF, NAVN] = SAMPLE_FIELD_IDS;

/** Three of six on the first go — the blank stays open with one check left. */
const FIRST_GO: Record<string, string> = {
  ...SAMPLE_ANSWERS,
  [KLOKKE]: '18:30',
  [ROM]: '2',
  [PRIS]: 'billig',
};

type Target = { itemKey: string | null; atomType: string; atomId: string; role: string };

const word = (itemKey: string | null, atomId: string): Target => ({
  itemKey,
  atomType: 'vocabulary_item',
  atomId,
  role: 'focus',
});
const grammar = (itemKey: string | null, atomId: string): Target => ({
  itemKey,
  atomType: 'grammar_rule',
  atomId,
  role: 'focus',
});
const skill = (atomId: string): Target => ({
  itemKey: null,
  atomType: 'skill',
  atomId,
  role: 'focus',
});

function defOf(
  doc: InformationTransferContent,
  mode: string,
  targets: Target[],
): ExerciseDefinition {
  // As content-service answers: the whole document in PRACTICE, its projection and no key in
  // GRADED (plan 73 phase 3).
  const graded = mode === 'GRADED';
  const content = toContent(doc);
  const expected = toExpectedAnswers(doc);
  return {
    exercise: {
      id: EXERCISE,
      templateCode: 'information_transfer',
      targetLanguage: 'nb',
      difficultyLevel: 'A2',
      content: (graded
        ? withStudentAudio(
            toStudentProjection(content, expected) as never,
            content,
            'information_transfer',
          )
        : content) as unknown as Record<string, unknown>,
      expectedAnswers: graded ? null : (expected as unknown as Record<string, unknown>),
      answerCheckSettings: null,
    },
    template: {
      code: 'information_transfer',
      contentSchema: {},
      answerSchema: { type: 'object' },
      defaultCheckSettings: {},
      supportedLanguages: null,
    },
    instruction: null,
    axes: { skills: ['listening', 'writing'], focus: ['pragmatics'], modality: 'recall' },
    targets,
  } as unknown as ExerciseDefinition;
}

function setup(
  opts: {
    doc?: InformationTransferContent;
    targets?: Target[];
    relationAtoms?: Array<{ atomType: string; atomId: string }>;
    practiceFetchFails?: boolean;
  } = {},
) {
  const doc = opts.doc ?? sampleContent();
  const rows = new Map<string, Attempt>();
  const modes: string[] = [];

  const repo = {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    findInProgress: jest.fn(
      async (userId: string, exerciseId: string) =>
        [...rows.values()].find(
          (a) => a.userId === userId && a.exerciseId === exerciseId && a.status === 'IN_PROGRESS',
        ) ?? null,
    ),
    // The repository's rule, in memory: the latest attempt, scored, its last check not closed.
    findOpenBoard: jest.fn(async (userId: string, exerciseId: string) => {
      const latest = [...rows.values()]
        .filter(
          (a) => a.userId === userId && a.exerciseId === exerciseId && a.status !== 'IN_PROGRESS',
        )
        .at(-1);
      const details = latest?.validationDetails as { closed?: unknown } | null | undefined;
      return latest?.status === 'SCORED' && details?.closed === false ? latest : null;
    }),
    findLatestReturned: jest.fn(async () => null),
    save: jest.fn(async (attempt: Attempt) => {
      rows.set(attempt.id, attempt);
    }),
  };

  const content = {
    getExerciseForAttempt: jest.fn(async (_id: string, _lang: string, mode: string) => {
      modes.push(mode);
      if (mode === 'PRACTICE' && opts.practiceFetchFails === true && modes.length > 1) {
        return Result.fail({ statusCode: 503, message: 'Content is away' });
      }
      return Result.ok(defOf(doc, mode, opts.targets ?? []));
    }),
    getPracticedAtoms: jest.fn(async () => Result.ok(opts.relationAtoms ?? [])),
    getExercisePlacement: jest.fn(async () =>
      Result.fail({ statusCode: 404, message: 'Not placed' }),
    ),
  };
  const organization = {
    resolveLearnerReviewContext: jest.fn(async () =>
      Result.fail({ statusCode: 404, message: 'No context' }),
    ),
  };
  const published: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const publisher = {
    publish: jest.fn(async (type: string, payload: Record<string, unknown>) => {
      published.push({ type, payload });
    }),
  };
  const review = new ReviewContextResolver(content as never, organization as never);
  const inner = new InformationTransferValidator();
  const validator = {
    validate: jest.fn(async (input: unknown) => inner.validate(input as never)),
    supports: () => true,
  };
  const feedback = { generate: jest.fn(async () => Result.ok({ summary: 'Ok' })) };

  const start = new StartAttemptHandler(
    repo as never,
    content as never,
    review,
    publisher as never,
  );
  const submit = new SubmitAnswerHandler(
    repo as never,
    content as never,
    validator as never,
    feedback as never,
    publisher as never,
    review,
  );

  return {
    repo,
    modes,
    published,
    async start(mode: 'PRACTICE' | 'GRADED' = 'PRACTICE'): Promise<StartAttemptResult> {
      const result = await start.execute(
        new StartAttemptCommand(
          USER,
          EXERCISE,
          'nb',
          mode === 'GRADED' ? 'assignment-1' : null,
          null,
          mode,
        ),
      );
      if (!result.isOk) throw new Error(`start failed: ${JSON.stringify(result.error)}`);
      return result.value;
    },
    async check(attemptId: string, cells: Record<string, string>) {
      return submit.execute(new SubmitAnswerCommand(attemptId, USER, { cells }, 20, 'nb'));
    },
    attempt: (id: string) => rows.get(id)!,
    completed: () =>
      published.filter((e) => e.type === 'exercise.attempt.completed').map((e) => e.payload),
  };
}

const withMemory = (memory: Memory): InformationTransferContent => {
  const doc = sampleContent();
  return { ...doc, scoring: { ...doc.scoring, memory } };
};

type Projection = {
  fields: Array<Record<string, unknown>>;
  answering: Record<string, unknown>;
  audio?: { transcript?: unknown; segments?: unknown };
} & Record<string, unknown>;

// ── The projection ──────────────────────────────────────────────────────────

describe('start — the blank without its key (INF-M12, both doors)', () => {
  it('ships the fields with nothing that decides them, and no pass mark', async () => {
    const h = setup();
    const result = await h.start();

    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    expect(projection.fields.map((f) => f['id'])).toEqual([...SAMPLE_FIELD_IDS]);
    for (const field of projection.fields) {
      expect(field).not.toHaveProperty('expected');
      expect(field).not.toHaveProperty('why');
      expect(field).not.toHaveProperty('required');
    }
    for (const key of ['grading', 'scoring', 'focus', 'passage']) {
      expect(projection).not.toHaveProperty(key);
    }
    const serialised = JSON.stringify(projection);
    // A reason and a wording that is only in the key are nowhere; the transcript waits too.
    expect(serialised).not.toContain('Halv seks');
    expect(serialised).not.toContain('Anne Lise');
    expect(serialised).not.toContain('204');
    // Under hintsAfter: 1 the hints arrive with the first verdict, not now.
    expect(serialised).not.toContain('"hint"');
  });

  it('in GRADED mode projects from the unprojected document, under graded settings', async () => {
    const h = setup({
      doc: {
        ...sampleContent(),
        answering: { ...sampleContent().answering, attempts: 3, revealKey: 'immediately' },
      },
    });
    const result = await h.start('GRADED');

    expect(h.modes).toEqual(['GRADED', 'PRACTICE']);
    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    expect(projection.fields).toHaveLength(6);
    expect(projection.answering).toMatchObject({ attempts: 1, revealKey: 'never', hintsAfter: 9 });
    expect(JSON.stringify(projection)).not.toContain('Halv seks');
  });

  it('in GRADED mode hands on an envelope it cannot re-fetch as it stands, still under graded settings', async () => {
    const h = setup({ practiceFetchFails: true });
    const result = await h.start('GRADED');

    const projection = result.exerciseContent as Projection;
    expect(projection.fields).toHaveLength(6);
    expect(projection.answering).toMatchObject({ attempts: 1, revealKey: 'never' });
  });
});

// ── Memory ──────────────────────────────────────────────────────────────────

describe('start — what the answers may move (INF-S11, INF-S12, Q3-A)', () => {
  // A word on the name cell, a word on the price cell (an author's slip — a price is no word), a
  // grammar rule on the time cell, and a word on the exercise as a whole.
  const targets = [
    word(NAVN, 'w-navn'),
    word(PRIS, 'w-krone'),
    grammar(KLOKKE, 'g-klokka'),
    word(null, 'w-kurs'),
  ];
  const relationAtoms = [
    { atomType: 'vocabulary_item', atomId: 'w-navn' },
    { atomType: 'vocabulary_item', atomId: 'w-bibliotek' },
    { atomType: 'grammar_rule', atomId: 'g-klokka' },
  ];

  it('under skill: every word out, the grammar left alone, the skill atom on the whole exercise', async () => {
    const h = setup({ targets, relationAtoms });
    const attempt = h.attempt((await h.start()).attemptId);

    expect(attempt.itemTargets).toEqual([
      grammar(KLOKKE, 'g-klokka'),
      skill('nb:selective_listening'),
    ]);
    expect(attempt.practicedAtoms).toEqual([{ atomType: 'grammar_rule', atomId: 'g-klokka' }]);
  });

  it('under skill+words: words only on word/name cells, and only the ones those cells address', async () => {
    const h = setup({ doc: withMemory('skill+words'), targets, relationAtoms });
    const attempt = h.attempt((await h.start()).attemptId);

    expect(attempt.itemTargets).toEqual([
      word(NAVN, 'w-navn'),
      grammar(KLOKKE, 'g-klokka'),
      skill('nb:selective_listening'),
    ]);
    expect(attempt.practicedAtoms).toEqual([
      { atomType: 'vocabulary_item', atomId: 'w-navn' },
      { atomType: 'grammar_rule', atomId: 'g-klokka' },
    ]);
  });

  it('under none: no word and no skill atom', async () => {
    const h = setup({ doc: withMemory('none'), targets, relationAtoms });
    const attempt = h.attempt((await h.start()).attemptId);

    expect(attempt.itemTargets).toEqual([grammar(KLOKKE, 'g-klokka')]);
    expect(attempt.itemTargets.some((t) => t.atomType === 'skill')).toBe(false);
  });

  it('names the skill by the source: reading for a text', async () => {
    const h = setup({ doc: sampleContent('text') });
    const attempt = h.attempt((await h.start()).attemptId);
    expect(attempt.itemTargets).toEqual([skill('nb:selective_reading')]);
  });

  it('snapshots the same in GRADED mode, from the unprojected document', async () => {
    const h = setup({ doc: withMemory('skill+words'), targets });
    const attempt = h.attempt((await h.start('GRADED')).attemptId);
    expect(attempt.itemTargets).toContainEqual(word(NAVN, 'w-navn'));
    expect(attempt.itemTargets).not.toContainEqual(word(PRIS, 'w-krone'));
  });

  it("publishes the skill as a target of the whole exercise and each cell's verdict with its own addresses", async () => {
    const h = setup({ doc: withMemory('skill+words'), targets });
    const { attemptId } = await h.start();
    await h.check(attemptId, FIRST_GO);

    const event = h.completed()[0]!;
    expect(event['targets']).toEqual([
      { atomType: 'skill', atomId: 'nb:selective_listening', role: 'focus' },
    ]);
    const gaps = event['gapResults'] as Array<{
      gapKey: string;
      correct: boolean;
      targets?: unknown[];
    }>;
    expect(gaps.find((g) => g.gapKey === NAVN)).toEqual({
      gapKey: NAVN,
      correct: true,
      targets: [{ atomType: 'vocabulary_item', atomId: 'w-navn', role: 'focus' }],
    });
    // The price cell lost its word: its verdict travels with no address.
    expect(gaps.find((g) => g.gapKey === PRIS)).toEqual({ gapKey: PRIS, correct: false });
  });
});

// ── A reload ────────────────────────────────────────────────────────────────

describe('a reload of an open blank (INF-S14)', () => {
  it('hands back the same attempt with the check it ended on — locks and hints, no record fields', async () => {
    const h = setup();
    const { attemptId } = await h.start();
    const first = await h.check(attemptId, FIRST_GO);
    expect(first.isOk).toBe(true);

    const reload = await h.start();

    expect(reload.attemptId).toBe(attemptId);
    const board = reload.boardCheck as {
      closed: boolean;
      checksLeft: number;
      locked: string[];
      items: Array<Record<string, unknown>>;
    };
    expect(board).toMatchObject({ closed: false, checksLeft: 1 });
    expect(board.locked.sort()).toEqual([DATO, TLF, NAVN].sort());
    expect(board.items.find((c) => c['itemId'] === KLOKKE)).toMatchObject({
      value: '18:30',
      verdict: 'wrong',
      hint: 'kl.',
    });
    expect(board).not.toHaveProperty('unread');
    expect(board.items.every((c) => !('firstAnswer' in c))).toBe(true);
    // The check is what the student was told: the same as the reply to it.
    expect(board).toEqual(first.value.details);
  });

  it('starts afresh once the blank is closed', async () => {
    const h = setup();
    const { attemptId } = await h.start();
    await h.check(attemptId, SAMPLE_ANSWERS); // passes → closed

    const next = await h.start();
    expect(next.attemptId).not.toBe(attemptId);
    expect(next.boardCheck).toBeNull();
  });
});
