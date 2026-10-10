import { jest } from '@jest/globals';
import {
  sampleDocument,
  setFeedback,
  setScoring,
  setSet,
  toContent,
  toExpectedAnswers,
  toStudentProjection,
} from '@ssz/shared-kernel/minimal-pairs';
import type { DealtProbe, MinimalPairsContent } from '@ssz/shared-kernel/minimal-pairs';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import type { StartAttemptResult } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { HandOutProbeHandler } from '../../../src/modules/attempts/application/commands/hand-out-probe/hand-out-probe.handler.js';
import type { HandedOutProbe } from '../../../src/modules/attempts/application/commands/hand-out-probe/hand-out-probe.handler.js';
import { HandOutProbeCommand } from '../../../src/modules/attempts/application/commands/hand-out-probe/hand-out-probe.command.js';
import { AnswerQuestionHandler } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.handler.js';
import type { ProbeVerdict } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.handler.js';
import { AnswerQuestionCommand } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.command.js';
import { SubmitAnswerHandler } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { historyFor } from '../../../src/modules/attempts/application/services/minimal-pairs-sitting.js';
import { MinimalPairsValidator } from '../../../src/infrastructure/validation/validators/minimal-pairs.validator.js';
import type { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import type { ExerciseDefinition } from '../../../src/shared/application/ports/content-client.port.js';
import type { IMediaAssets } from '../../../src/shared/application/ports/media-assets.port.js';
import { MediaAssetsError } from '../../../src/shared/application/ports/media-assets.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 72 phase 5 — a `minimal_pairs` sitting through the engine, end to end: the draw made
// and kept at the start, one probe handed out at a time without its key, each answer judged
// against the draw, and the submit summed from what the server recorded. The handlers are the
// real ones; the repository is in memory, content-service and media-service are stubs.

const USER = 'user-1';
const EXERCISE = 'ex-1';

// ── Stubs ───────────────────────────────────────────────────────────────────

function defOf(doc: MinimalPairsContent, mode: string, targets: unknown[] = []): ExerciseDefinition {
  // As content-service answers: the whole document in PRACTICE, its projection and no key in
  // GRADED (plan 72 phase 4).
  const graded = mode === 'GRADED';
  return {
    exercise: {
      id: EXERCISE,
      templateCode: 'minimal_pairs',
      targetLanguage: 'nb',
      difficultyLevel: 'A2',
      content: (graded ? toStudentProjection(toContent(doc)) : toContent(doc)) as unknown as Record<string, unknown>,
      expectedAnswers: graded ? null : (toExpectedAnswers(doc) as unknown as Record<string, unknown>),
      answerCheckSettings: null,
    },
    template: {
      code: 'minimal_pairs',
      contentSchema: {},
      answerSchema: { type: 'object' },
      defaultCheckSettings: {},
      supportedLanguages: null,
    },
    instruction: null,
    axes: { skills: ['listening'], focus: ['phonology'], modality: 'recognition' },
    targets,
  } as unknown as ExerciseDefinition;
}

function setup(opts: {
  doc?: MinimalPairsContent;
  targets?: unknown[];
  relationAtoms?: Array<{ atomType: string; atomId: string }>;
  media?: IMediaAssets | null;
  scoredDetails?: unknown[];
} = {}) {
  let doc = opts.doc ?? sampleDocument();
  const rows = new Map<string, Attempt>();
  const scoredDetails = opts.scoredDetails ?? [];

  const repo = {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    findInProgress: jest.fn(async (userId: string, exerciseId: string) =>
      [...rows.values()].find(
        (a) => a.userId === userId && a.exerciseId === exerciseId && a.status === 'IN_PROGRESS',
      ) ?? null,
    ),
    findOpenBoard: jest.fn(async () => null),
    findLatestReturned: jest.fn(async () => null),
    countSubmitted: jest.fn(async (userId: string, exerciseId: string) =>
      [...rows.values()].filter(
        (a) => a.userId === userId && a.exerciseId === exerciseId && a.submittedAt !== null,
      ).length,
    ),
    findScoredDetails: jest.fn(async () => scoredDetails),
    save: jest.fn(async (attempt: Attempt) => {
      rows.set(attempt.id, attempt);
    }),
  };

  const content = {
    getExerciseForAttempt: jest.fn(async (_id: string, _lang: string, mode: string) =>
      Result.ok(defOf(doc, mode, opts.targets)),
    ),
    getPracticedAtoms: jest.fn(async () => Result.ok(opts.relationAtoms ?? [])),
    getExercisePlacement: jest.fn(async () => Result.fail({ statusCode: 404, message: 'Not placed' })),
  };
  const organization = {
    resolveLearnerReviewContext: jest.fn(async () => Result.fail({ statusCode: 404, message: 'No context' })),
  };
  const published: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const publisher = {
    publish: jest.fn(async (type: string, payload: Record<string, unknown>) => {
      published.push({ type, payload });
    }),
  };

  const media: IMediaAssets | null =
    opts.media === undefined
      ? {
          describe: jest.fn(async () => Result.ok([])),
          playback: jest.fn(async (ids: string[]) =>
            Result.ok(
              ids.map((id) => ({
                id,
                url: `https://media.test/${id}.mp3?sig=1`,
                mimeType: 'audio/mpeg',
                expiresAt: '2026-10-08T13:00:00.000Z',
                durationMs: 700,
              })),
            ),
          ),
        }
      : opts.media;

  const review = new ReviewContextResolver(content as never, organization as never);
  const start = new StartAttemptHandler(repo as never, content as never, review, publisher as never);
  const items = new HandOutProbeHandler(repo as never, content as never, media);
  const answers = new AnswerQuestionHandler(repo as never, content as never, media);
  const validator = new MinimalPairsValidator();
  const submit = new SubmitAnswerHandler(
    repo as never,
    content as never,
    { validate: async (input: never) => validator.validate(input), supports: () => true } as never,
    { generate: async () => Result.ok({ summary: 'Done' }) } as never,
    publisher as never,
    review,
    undefined,
    media,
  );

  return {
    repo,
    content,
    published,
    media,
    setDoc: (next: MinimalPairsContent) => {
      doc = next;
    },
    start: async (mode: 'PRACTICE' | 'GRADED' = 'PRACTICE') =>
      start.execute(new StartAttemptCommand(USER, EXERCISE, 'nb', null, null, mode)),
    items: async (attemptId: string, userId = USER) =>
      items.execute(new HandOutProbeCommand(attemptId, userId)),
    answer: async (attemptId: string, questionId: string, optionId: string) =>
      answers.execute(
        new AnswerQuestionCommand(attemptId, USER, questionId, { kind: 'option', optionId, reveal: false }),
      ),
    submit: async (attemptId: string) =>
      submit.execute(new SubmitAnswerCommand(attemptId, USER, { answers: [] }, 30)),
    attempt: (id: string) => repo.findById(id) as Promise<Attempt>,
  };
}

const drawOf = (attempt: Attempt) => attempt.probeDraw as DealtProbe[];
const wrongFor = (probe: DealtProbe) => probe.optionIds.find((id) => id !== probe.wordId)!;

async function started(h: ReturnType<typeof setup>, mode: 'PRACTICE' | 'GRADED' = 'PRACTICE') {
  const result = await h.start(mode);
  if (result.isFail) throw new Error(`start failed: ${JSON.stringify(result.error)}`);
  return result.value as StartAttemptResult;
}

// ── Start ───────────────────────────────────────────────────────────────────

describe('start — the draw is made once, kept on the attempt, and never sent (MP-S1)', () => {
  it('stores a draw of the asked length and hands out only the projection', async () => {
    const h = setup();
    const res = await started(h);
    const attempt = await h.attempt(res.attemptId);

    expect(drawOf(attempt)).toHaveLength(12);
    expect(res.exerciseContent).not.toHaveProperty('pairs');
    const body = JSON.stringify(res);
    expect(body).not.toContain('as_');
    expect(body).not.toContain('kjære');
    expect(res.expectedAnswers).toBeNull();
    expect((res.exerciseContent as { set: { probes: number } }).set.probes).toBe(12);
  });

  it('says how many probes the draw really holds when repeats are off', async () => {
    const h = setup({ doc: setSet(sampleDocument(), { allowRepeat: false, probes: 30 }) });
    const res = await started(h);
    const drawn = drawOf(await h.attempt(res.attemptId)).length;
    expect(drawn).toBeLessThan(30);
    expect((res.exerciseContent as { set: { probes: number } }).set.probes).toBe(drawn);
  });

  it('resumes the same draw on a reload instead of conflicting', async () => {
    const h = setup();
    const first = await started(h);
    const draw = drawOf(await h.attempt(first.attemptId));
    const again = await started(h);
    expect(again.attemptId).toBe(first.attemptId);
    expect(drawOf(await h.attempt(again.attemptId))).toEqual(draw);
  });

  it('turns the second chance off in the projection of an assignment (MP-S14)', async () => {
    const h = setup({ doc: setFeedback(sampleDocument(), { secondChance: true }) });
    const res = await started(h, 'GRADED');
    expect((res.exerciseContent as { feedback: { secondChance: boolean } }).feedback.secondChance).toBe(false);
    // Drawn from the whole document, fetched again in PRACTICE: the projection has no pairs.
    expect(drawOf(await h.attempt(res.attemptId))).toHaveLength(12);
  });

  it('refuses a sitting past the author’s limit (MP-S13)', async () => {
    const h = setup({ doc: setScoring(sampleDocument(), { attempts: 1 }) });
    const first = await started(h);
    expect((await h.submit(first.attemptId)).isOk).toBe(true);
    const second = await h.start();
    expect(second.isFail && second.error).toEqual({ code: 'MP_SITTINGS_SPENT', allowed: 1 });
  });

  it('refuses a set with nothing to play', async () => {
    const doc = sampleDocument();
    doc.pairs.forEach((p) => p.words.forEach((w) => (w.clip.assetId = '')));
    const res = await setup({ doc }).start();
    expect(res.isFail && res.error).toEqual({ code: 'MP_EMPTY_SET' });
  });

  it('reads the learner’s own history only for weakest (MP-S12)', async () => {
    const balanced = setup();
    await started(balanced);
    expect(balanced.repo.findScoredDetails).not.toHaveBeenCalled();

    const weakest = setup({ doc: setSet(sampleDocument(), { sampling: 'weakest' }) });
    await started(weakest);
    expect(weakest.repo.findScoredDetails).toHaveBeenCalledWith(USER, 'minimal_pairs', 'nb', 50);
  });
});

describe('start — what the answers may move (MP-S10, Q1-A)', () => {
  const vocab = { itemKey: null, atomType: 'vocabulary_item', atomId: 'word-1', role: 'focus' };
  const contrast = (atomId: string) => ({ itemKey: null, atomType: 'phonological_contrast', atomId, role: 'focus' });

  it('rates the contrasts and takes the words out under contrast', async () => {
    const h = setup({ targets: [vocab], relationAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-2' }] });
    const attempt = await h.attempt((await started(h)).attemptId);
    expect(attempt.practicedAtoms).toEqual([]);
    expect(attempt.itemTargets).toEqual([contrast('nb:kjsj'), contrast('nb:consonant')]);
  });

  it('keeps the words under contrast+word', async () => {
    const h = setup({
      doc: setScoring(sampleDocument(), { memory: 'contrast+word' }),
      targets: [vocab],
    });
    const attempt = await h.attempt((await started(h)).attemptId);
    expect(attempt.practicedAtoms).toEqual([{ atomType: 'vocabulary_item', atomId: 'word-1' }]);
    expect(attempt.itemTargets).toEqual([vocab, contrast('nb:kjsj'), contrast('nb:consonant')]);
  });

  it('moves nothing under none', async () => {
    const h = setup({ doc: setScoring(sampleDocument(), { memory: 'none' }), targets: [vocab] });
    const attempt = await h.attempt((await started(h)).attemptId);
    expect(attempt.practicedAtoms).toEqual([]);
    expect(attempt.itemTargets).toEqual([]);
  });
});

// ── /items ──────────────────────────────────────────────────────────────────

describe('/items — the current probe, without its key (MP-S2, MP-S3)', () => {
  it('hands out probe 1 with a signed clip and no spelling under afterAnswer', async () => {
    const h = setup({ doc: setFeedback(sampleDocument(), { showSpelling: 'afterAnswer' }) });
    const { attemptId } = await started(h);
    const res = await h.items(attemptId);
    const probe = (res.isOk && res.value) as HandedOutProbe;
    const drawn = drawOf(await h.attempt(attemptId))[0]!;

    expect(probe.n).toBe(1);
    expect(probe.questionId).toBe('p1');
    expect(probe.clip.url).toMatch(/^https:\/\/media\.test\//);
    expect(probe.options.map((o) => o.id)).toEqual(drawn.optionIds);
    expect(probe.options.every((o) => o.text === undefined && o.gloss === undefined)).toBe(true);
    expect(probe).not.toHaveProperty('keyOptionId');
    expect(probe.state).toEqual({ tries: 0, maxTries: 1, closed: false });
  });

  it('spells the buttons under always and never sends the meaning before the answer', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    const probe = ((await h.items(attemptId)) as { value: HandedOutProbe }).value;
    expect(probe.options.every((o) => typeof o.text === 'string')).toBe(true);
    expect(probe.options.every((o) => o.gloss === undefined)).toBe(true);
  });

  it('is idempotent and moves on only when a probe closes', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    const a = await h.items(attemptId);
    const b = await h.items(attemptId);
    expect(a).toEqual(b);
    const first = drawOf(await h.attempt(attemptId))[0]!;
    await h.answer(attemptId, 'p1', first.wordId);
    const next = ((await h.items(attemptId)) as { value: HandedOutProbe }).value;
    expect(next.n).toBe(2);
    expect(next.closedProbes).toEqual([{ n: 1, correct: true }]);
  });

  it('refuses a stranger, a set with every probe closed, and a clip that cannot be signed', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    expect(await h.items(attemptId, 'someone-else')).toEqual(Result.fail({ code: 'FORBIDDEN' }));

    for (const p of drawOf(await h.attempt(attemptId))) await h.answer(attemptId, `p${p.n}`, p.wordId);
    expect(await h.items(attemptId)).toEqual(Result.fail({ code: 'ALL_PROBES_CLOSED' }));

    const away = setup({
      media: {
        describe: async () => Result.ok([]),
        playback: async () => Result.fail(new MediaAssetsError(503, 'away')),
      },
    });
    const other = await started(away);
    expect(await away.items(other.attemptId)).toEqual(Result.fail({ code: 'MEDIA_UNAVAILABLE' }));
  });
});

// ── /answers ────────────────────────────────────────────────────────────────

describe('/answers — the key only once the probe closes (MP-S4, MP-S5)', () => {
  it('closes a miss without a second chance and sends the key, the spelling and A/B', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    const probe = drawOf(await h.attempt(attemptId))[0]!;
    const res = await h.answer(attemptId, 'p1', wrongFor(probe));
    const v = (res.isOk && res.value.result) as ProbeVerdict;

    expect(v.correct).toBe(false);
    expect(v.closed).toBe(true);
    expect(v.keyOptionId).toBe(probe.wordId);
    expect(v.options!.every((o) => typeof o.text === 'string')).toBe(true);
    expect(v.compare?.chosen).toMatch(/media\.test/);
    expect(v.compare?.target).toMatch(/media\.test/);
  });

  it('keeps the key back on a miss with a second chance, and scores the first answer only', async () => {
    const h = setup({ doc: setFeedback(sampleDocument(), { secondChance: true }) });
    const { attemptId } = await started(h);
    const probe = drawOf(await h.attempt(attemptId))[0]!;

    const miss = (await h.answer(attemptId, 'p1', wrongFor(probe))) as { value: { result: ProbeVerdict } };
    expect(miss.value.result).toEqual({
      questionId: 'p1',
      n: 1,
      optionId: wrongFor(probe),
      correct: false,
      closed: false,
      tries: 1,
      triesLeft: 1,
      firstCorrect: false,
    });

    const hit = (await h.answer(attemptId, 'p1', probe.wordId)) as { value: { result: ProbeVerdict } };
    expect(hit.value.result.closed).toBe(true);
    expect(hit.value.result.correct).toBe(true);
    expect(hit.value.result.firstCorrect).toBe(false);
    // Right on the second try: nothing to compare.
    expect(hit.value.result.compare).toBeUndefined();

    expect(await h.answer(attemptId, 'p1', probe.wordId)).toEqual(Result.fail({ code: 'QUESTION_CLOSED' }));
  });

  it('allows one try in an assignment whatever the author set (Q6-A)', async () => {
    const h = setup({ doc: setFeedback(sampleDocument(), { secondChance: true }) });
    const { attemptId } = await started(h, 'GRADED');
    const probe = drawOf(await h.attempt(attemptId))[0]!;
    const miss = (await h.answer(attemptId, 'p1', wrongFor(probe))) as { value: { result: ProbeVerdict } };
    expect(miss.value.result.closed).toBe(true);
    expect(miss.value.result.keyOptionId).toBe(probe.wordId);
  });

  it('refuses a later probe, a stranger option and a reveal', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    const probe = drawOf(await h.attempt(attemptId))[0]!;
    expect(await h.answer(attemptId, 'p2', probe.wordId)).toEqual(Result.fail({ code: 'QUESTION_NOT_CURRENT' }));
    expect(await h.answer(attemptId, 'p99', probe.wordId)).toEqual(Result.fail({ code: 'QUESTION_NOT_FOUND' }));
    expect(await h.answer(attemptId, 'p1', 'nobody')).toEqual(Result.fail({ code: 'OPTION_NOT_FOUND' }));
  });
});

// ── Submit ──────────────────────────────────────────────────────────────────

describe('submit — summed from what the server recorded (MP-S6 … MP-S11)', () => {
  it('scores first answers, counts an unanswered probe wrong and shows the student only the summary', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    const draw = drawOf(await h.attempt(attemptId));
    // Six right, one wrong, five never answered.
    for (const p of draw.slice(0, 6)) await h.answer(attemptId, `p${p.n}`, p.wordId);
    await h.answer(attemptId, 'p7', wrongFor(draw[6]!));

    const res = await h.submit(attemptId);
    expect(res.isOk).toBe(true);
    const value = (res as { value: { score: number; details: Record<string, unknown> } }).value;
    expect(value.score).toBe(50);

    const details = value.details as {
      right: number;
      total: number;
      passed: boolean;
      passPct: number;
      pairs: Array<{ words: string[]; clips: string[]; played: number }>;
    };
    expect(details).toMatchObject({ right: 6, total: 12, passed: false, passPct: 75, memory: 'contrast' });
    expect(details).not.toHaveProperty('probes');
    for (const pair of details.pairs) {
      expect(pair.clips).toHaveLength(pair.words.length);
      expect(pair.clips.every((url) => url.startsWith('https://media.test/'))).toBe(true);
    }
    expect(JSON.stringify(details)).not.toContain('Startparet');

    // The teacher's record keeps every probe with its provenance (MP-S9).
    const stored = (await h.attempt(attemptId)).validationDetails as { probes: Array<{ provenance: string }> };
    expect(stored.probes).toHaveLength(12);
    expect(stored.probes.every((p) => p.provenance === 'studio')).toBe(true);
  });

  it('publishes the contrasts and no gap results, answer form or word fan-out (MP-S10, MP-S11)', async () => {
    const h = setup({ relationAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-1' }] });
    const { attemptId } = await started(h);
    for (const p of drawOf(await h.attempt(attemptId))) await h.answer(attemptId, `p${p.n}`, p.wordId);
    await h.submit(attemptId);

    const scored = h.published.find((e) => e.type === 'exercise.attempt.completed');
    expect(scored).toBeDefined();
    const payload = scored!.payload;
    expect(payload['passed']).toBe(true);
    expect(payload['practicedAtoms']).toEqual([]);
    expect(payload['targets']).toEqual([
      { atomType: 'phonological_contrast', atomId: 'nb:kjsj', role: 'focus' },
      { atomType: 'phonological_contrast', atomId: 'nb:consonant', role: 'focus' },
    ]);
    expect(payload).not.toHaveProperty('gapResults');
    expect(payload).not.toHaveProperty('answerForm');
  });

  it('is checked once — «Ny runde» is a new attempt', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    expect((await h.submit(attemptId)).isOk).toBe(true);
    expect((await h.submit(attemptId)).isFail).toBe(true);
    const next = await started(h);
    expect(next.attemptId).not.toBe(attemptId);
  });

  it('leaves what weakest reads: a sitting’s details are a history of the words missed', async () => {
    const h = setup();
    const { attemptId } = await started(h);
    const draw = drawOf(await h.attempt(attemptId));
    for (const p of draw) await h.answer(attemptId, `p${p.n}`, wrongFor(p));
    await h.submit(attemptId);
    const details = (await h.attempt(attemptId)).validationDetails;

    const history = historyFor(sampleDocument(), [details])!;
    const missed = Object.values(history).reduce((n, w) => n + w.missed, 0);
    expect(missed).toBe(12);
    expect(Object.values(history).every((w) => w.played === w.missed)).toBe(true);
    expect(historyFor(sampleDocument(), [])).toBeUndefined();
  });
});
