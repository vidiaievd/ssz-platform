import { jest } from '@jest/globals';
import { SAMPLE_PROMPT_IDS, sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/read-aloud';
import {
  DEFAULT_SETTINGS as SHORT_ANSWER_DEFAULTS,
  toContent as saToContent,
  toExpectedAnswers as saToExpectedAnswers,
} from '@ssz/shared-kernel/short-answer';
import { CheckAttemptHandler } from '../../../src/modules/attempts/application/commands/check-attempt/check-attempt.handler.js';
import { CheckAttemptCommand } from '../../../src/modules/attempts/application/commands/check-attempt/check-attempt.command.js';
import type {
  AiPrecheckOutcome,
  AiPrecheckRequest,
} from '../../../src/shared/application/ports/ai-precheck-client.port.js';
import { AiPrecheckClientError } from '../../../src/shared/application/ports/ai-precheck-client.port.js';
import type { SchoolAiPrecheckSettings } from '../../../src/shared/application/ports/precheck-settings-reader.port.js';
import type { FeatureEntitlement } from '../../../src/shared/application/ports/entitlements-client.port.js';
import { EntitlementsClientError } from '../../../src/shared/application/ports/entitlements-client.port.js';
import type { MediaAssetDescription } from '../../../src/shared/application/ports/media-assets.port.js';
import { RecordingRefusal } from '../../../src/modules/attempts/application/services/read-aloud-recordings.js';
import { Result } from '../../../src/shared/kernel/result.js';

// The error-correction exercise of the self-check spec: two tense shifts in the first
// sentence, a kept inversion in the second.
const ecContent = {
  mode: 'sentences',
  note: '',
  items: [
    { id: 's-0', wrong: 'Anne sa at han har skrivefeil, og hun er glad.' },
    { id: 's-1', wrong: 'Kari spør om har han fagbrev.' },
  ],
  check: { on: true, exactPass: true },
  flow: { selfCheck: 2 },
  hints: { count: true },
};
const ecExpected = {
  items: {
    's-0': { ref: 'Anne sa at han hadde skrivefeil, og hun var glad.', alts: [], meta: {} },
    's-1': { ref: 'Kari spør om han har fagbrev.', alts: [], meta: {} },
  },
};
const ecDraft = { items: { 's-0': { marked: { 4: true }, fix: { 4: 'hadde' }, ins: {} } } };

const writingContent = {
  mode: 'free',
  instruction: 'Skriv om helgen din.',
  prompt: 'Hva gjorde du i helgen?',
  settings: { aiStage: true, minWords: 10, maxWords: 200, ai: { grammar: true, task: true } },
};

function makeAttempt(overrides: Record<string, unknown> = {}) {
  let used = (overrides['selfChecksUsed'] as number | undefined) ?? 0;
  return {
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'writing_task',
    targetLanguage: 'nb',
    status: 'IN_PROGRESS',
    schoolId: 'school-1',
    containerId: 'course-1',
    previousAttemptId: null,
    answeredQuestions: [],
    get selfChecksUsed() {
      return used;
    },
    useSelfCheck: jest.fn((budget: number) => {
      if (used >= budget) return Result.fail({ message: 'All self-checks have been used' });
      used += 1;
      return Result.ok();
    }),
    ...overrides,
  };
}

const ok = (feedback: Record<string, unknown> = { summary: 'Sjekk verbene.', items: [] }): AiPrecheckOutcome => ({
  status: 'ok',
  feedback: feedback as never,
  aiCallIds: ['call-1'],
  remaining: { exercise: 2, learnerCredits: '9.000000', learnerChecksApprox: 9 },
});

function setup(opts: {
  attempt?: unknown;
  document?: { content: unknown; expectedAnswers: unknown };
  settings?: SchoolAiPrecheckSettings | null | Error;
  plan?: FeatureEntitlement | EntitlementsClientError;
  outcome?: AiPrecheckOutcome | AiPrecheckClientError;
  assets?: MediaAssetDescription[];
} = {}) {
  const attempt = opts.attempt ?? makeAttempt();
  const attempts = { findById: jest.fn(() => Promise.resolve(attempt)), save: jest.fn() };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(Result.ok({ exercise: opts.document ?? { content: writingContent, expectedAnswers: {} } })),
    ),
  };
  const settings = {
    schoolAiPrecheck: jest.fn(() => {
      const s = opts.settings === undefined ? { enabled: true, perExerciseLimit: 3, perLearnerMonthlyCredits: null } : opts.settings;
      return s instanceof Error ? Promise.reject(s) : Promise.resolve(s);
    }),
  };
  const entitlements = {
    feature: jest.fn(() => {
      const p = opts.plan ?? { enabled: true, limits: {} };
      return Promise.resolve(p instanceof EntitlementsClientError ? Result.fail(p) : Result.ok(p));
    }),
  };
  const ai = {
    precheck: jest.fn((_request: AiPrecheckRequest) => {
      const o = opts.outcome ?? ok();
      return Promise.resolve(o instanceof AiPrecheckClientError ? Result.fail(o) : Result.ok(o));
    }),
  };
  const media = {
    describe: jest.fn(() => Promise.resolve(Result.ok(opts.assets ?? []))),
  };
  const handler = new CheckAttemptHandler(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attempts as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentClient as any,
    settings,
    entitlements,
    ai,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    media as any,
  );
  const check = (draft: unknown) => handler.execute(new CheckAttemptCommand('att-1', 'user-1', draft));
  return { handler, attempt, attempts, contentClient, settings, entitlements, ai, media, check };
}

describe('CheckAttemptHandler (plan 84, step 5)', () => {
  describe('a template only a model can read', () => {
    it('asks ai-service with the school as payer and the school’s limits, and changes nothing', async () => {
      const { check, ai, attempts } = setup();

      const result = await check({ text: 'I helgen jeg har vært på hytta.', ticked: [] });

      expect(result.isOk).toBe(true);
      expect(result.value.ai).toEqual({ status: 'ok' });
      expect(result.value.feedback).toEqual({ summary: 'Sjekk verbene.', items: [] });
      expect(result.value.selfCheck).toBeNull();
      expect(result.value.remaining).toEqual({ exercise: 2, learnerCredits: '9.000000', learnerChecksApprox: 9 });

      const request = ai.precheck.mock.calls[0]![0];
      expect(request).toMatchObject({
        schoolId: 'school-1',
        userId: 'user-1',
        exerciseId: 'ex-1',
        attemptId: 'att-1',
        courseId: 'course-1',
        limits: { perExercise: 3, perLearnerMonthlyCredits: null },
      });
      expect(request.subject).toMatchObject({ template: 'writing_task', text: 'I helgen jeg har vært på hytta.' });
      // Rule 1: a rehearsal writes nothing on the attempt.
      expect(attempts.save).not.toHaveBeenCalled();
    });

    it('lowers the school’s monthly limit to the plan’s, never raises it', async () => {
      const lowerPlan = setup({
        settings: { enabled: true, perExerciseLimit: null, perLearnerMonthlyCredits: 100 },
        plan: { enabled: true, limits: { perLearnerMonthlyCredits: 40 } },
      });
      await lowerPlan.check({ text: 'Tekst.' });
      expect(lowerPlan.ai.precheck.mock.calls[0]![0].limits).toEqual({ perExercise: null, perLearnerMonthlyCredits: 40 });

      const noSchoolLimit = setup({
        settings: { enabled: true, perExerciseLimit: 3, perLearnerMonthlyCredits: null },
        plan: { enabled: true, limits: { perLearnerMonthlyCredits: 40 } },
      });
      await noSchoolLimit.check({ text: 'Tekst.' });
      expect(noSchoolLimit.ai.precheck.mock.calls[0]![0].limits.perLearnerMonthlyCredits).toBe(40);

      const lowerSchool = setup({
        settings: { enabled: true, perExerciseLimit: 3, perLearnerMonthlyCredits: 10 },
        plan: { enabled: true, limits: { perLearnerMonthlyCredits: 40 } },
      });
      await lowerSchool.check({ text: 'Tekst.' });
      expect(lowerSchool.ai.precheck.mock.calls[0]![0].limits.perLearnerMonthlyCredits).toBe(10);
    });

    it.each([
      ['the school switched it off', { settings: { enabled: false, perExerciseLimit: 3, perLearnerMonthlyCredits: null } }, 'disabled'],
      ['the school is not there', { settings: null }, 'disabled'],
      ['the plan has no ai.practice', { plan: { enabled: false, limits: {} } }, 'not_entitled'],
      ['there is no school behind the attempt', { attempt: makeAttempt({ schoolId: null }) }, 'no_school'],
    ] as const)('is a 403 when %s', async (_case, opts, reason) => {
      const { check, ai, contentClient } = setup(opts as Parameters<typeof setup>[0]);

      const result = await check({ text: 'Tekst.' });

      expect(result.isFail).toBe(true);
      expect(result.error).toEqual({ code: 'PRECHECK_NOT_AVAILABLE', reason });
      expect(ai.precheck).not.toHaveBeenCalled();
      // Refused before the key is read.
      expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
    });

    it('is a retryable failure when the setting or the plan cannot be read', async () => {
      const settingDown = await setup({ settings: new Error('ECONNREFUSED') }).check({ text: 'Tekst.' });
      expect(settingDown.error).toEqual({ code: 'PRECHECK_ACCESS_UNKNOWN' });

      const planDown = await setup({ plan: new EntitlementsClientError(503, 'down') }).check({ text: 'Tekst.' });
      expect(planDown.error).toEqual({ code: 'PRECHECK_ACCESS_UNKNOWN' });
    });

    it('passes a refusal by ai-service on as a 200, with what the limits leave', async () => {
      const { check } = setup({
        outcome: {
          status: 'refused',
          reason: 'exercise_limit',
          detail: null,
          remaining: { exercise: 0, learnerCredits: null, learnerChecksApprox: null },
        },
      });

      const result = await check({ text: 'Tekst.' });

      expect(result.value.ai).toEqual({ status: 'refused', reason: 'exercise_limit', detail: null });
      expect(result.value.feedback).toBeNull();
      expect(result.value.remaining).toEqual({ exercise: 0, learnerCredits: null, learnerChecksApprox: null });
    });

    it('reads an ai-service that does not answer as a failed check, not an error', async () => {
      const result = await setup({ outcome: new AiPrecheckClientError(503, 'timeout') }).check({ text: 'Tekst.' });

      expect(result.isOk).toBe(true);
      expect(result.value.ai).toEqual({ status: 'failed', errorCode: 'ai_unavailable' });
      expect(result.value.remaining).toBeNull();
    });
  });

  describe('a template with a deterministic self-check', () => {
    const ec = (over: Parameters<typeof setup>[0] = {}) =>
      setup({
        attempt: makeAttempt({ templateCode: 'error_correction' }),
        document: { content: ecContent, expectedAnswers: ecExpected },
        ...over,
      });

    it('runs the self-check first, on the author’s budget, then asks a model about what is left', async () => {
      const { check, ai, attempt, attempts } = ec();

      const result = await check(ecDraft);

      expect(result.value.selfCheck).toMatchObject({ checksUsed: 1, checksLeft: 1, fixedCount: 1, spanCount: 3 });
      expect((attempt as ReturnType<typeof makeAttempt>).useSelfCheck).toHaveBeenCalledWith(2);
      expect(attempts.save).toHaveBeenCalledTimes(1);
      expect(result.value.ai).toEqual({ status: 'ok' });
      expect(ai.precheck.mock.calls[0]![0].subject).toMatchObject({ template: 'error_correction' });
    });

    it('asks no model when the key alone settles the draft', async () => {
      const oneSentence = {
        content: { ...ecContent, items: [ecContent.items[0]] },
        expectedAnswers: { items: { 's-0': ecExpected.items['s-0'] } },
      };
      const { check, ai } = ec({ document: oneSentence });

      const result = await check({
        items: { 's-0': { marked: { 4: true, 8: true }, fix: { 4: 'hadde', 8: 'var' }, ins: {} } },
      });

      expect(result.value.selfCheck).toMatchObject({ fixedCount: 2, spanCount: 2 });
      expect(result.value.ai).toEqual({ status: 'not_asked', reason: 'key_settles' });
      expect(ai.precheck).not.toHaveBeenCalled();
    });

    it('still self-checks when the school offers no model', async () => {
      const { check, ai } = ec({ settings: { enabled: false, perExerciseLimit: 3, perLearnerMonthlyCredits: null } });

      const result = await check(ecDraft);

      expect(result.isOk).toBe(true);
      expect(result.value.selfCheck).toMatchObject({ fixedCount: 1 });
      expect(result.value.ai).toEqual({ status: 'not_asked', reason: 'disabled' });
      expect(ai.precheck).not.toHaveBeenCalled();
    });

    it('asks the model alone once the self-checks are spent', async () => {
      const { check, ai } = ec({ attempt: makeAttempt({ templateCode: 'error_correction', selfChecksUsed: 2 }) });

      const result = await check(ecDraft);

      expect(result.value.selfCheck).toBeNull();
      expect(result.value.ai).toEqual({ status: 'ok' });
      expect(ai.precheck).toHaveBeenCalledTimes(1);
    });

    it('answers the self-check’s own refusal when it is spent and no model may be asked', async () => {
      const { check } = ec({
        attempt: makeAttempt({ templateCode: 'error_correction', selfChecksUsed: 2 }),
        settings: { enabled: false, perExerciseLimit: 3, perLearnerMonthlyCredits: null },
      });

      const result = await check(ecDraft);

      expect(result.isFail).toBe(true);
      expect(result.error).toEqual({ message: 'All self-checks have been used' });
    });
  });

  describe('refusals before anything is read', () => {
    it('checks nothing after hand-in (rule 3)', async () => {
      const { check, ai } = setup({ attempt: makeAttempt({ status: 'SUBMITTED' }) });
      expect((await check({ text: 'Tekst.' })).error).toEqual({ code: 'NOT_IN_PROGRESS' });
      expect(ai.precheck).not.toHaveBeenCalled();
    });

    it('has no check for a template the client checks itself', async () => {
      const { check } = setup({ attempt: makeAttempt({ templateCode: 'gap_fill' }) });
      expect((await check({})).error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
    });

    it('refuses a draft of the wrong shape without reading the setting', async () => {
      const { check, settings } = setup();
      expect((await check('just text')).error).toEqual({ code: 'SCHEMA_MISMATCH' });
      expect(settings.schoolAiPrecheck).not.toHaveBeenCalled();
    });
  });

  describe('short_answer', () => {
    const question = (id: string) => ({
      id,
      kind: 'reading',
      passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
      prompt: 'Hva er nytt fra 1. januar?',
      model: 'Alle syklister må ha lykt foran og bak i mørket.',
      elements: [{ id: 'e1', label: 'Kravet', anchors: ['lykt foran'], required: true }],
      why: 'Regelen står i første setning.',
    });
    const doc = {
      title: 'Sykkelregler',
      instruction: 'Svar med egne ord.',
      questions: [question('q1'), question('q2')],
      settings: { ...SHORT_ANSWER_DEFAULTS, aiStage: true },
    };

    it('drops the questions already handed in', async () => {
      const { check, ai } = setup({
        attempt: makeAttempt({ templateCode: 'short_answer', answeredQuestions: [{ questionId: 'q1' }] }),
        document: { content: saToContent(doc as never), expectedAnswers: saToExpectedAnswers(doc as never) },
      });

      await check({
        answers: [
          { questionId: 'q1', text: 'Lys foran.' },
          { questionId: 'q2', text: 'Alle må ha lys.' },
        ],
      });

      const subject = ai.precheck.mock.calls[0]![0].subject as { questions: Array<{ itemId: string }> };
      expect(subject.questions.map((q) => q.itemId)).toEqual(['q2']);
    });
  });

  describe('read_aloud', () => {
    const [P1, P2] = SAMPLE_PROMPT_IDS;
    const doc = sampleDocument();
    const document = { content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) };
    const asset = (id: string, over: Partial<MediaAssetDescription> = {}): MediaAssetDescription => ({
      id,
      ownerId: 'user-1',
      entityType: 'submission_recording',
      entityId: 'att-1',
      status: 'READY',
      mimeType: 'audio/webm',
      sizeBytes: 60_000,
      durationMs: 20_000,
      ...over,
    });
    const reading = (attempt = makeAttempt({ templateCode: 'read_aloud' })) => ({ attempt, document });

    it('refuses a take that is not this learner’s before its id goes to ai-service', async () => {
      const { check, ai } = setup({ ...reading(), assets: [asset('a1', { ownerId: 'someone-else' })] });

      const result = await check({ recordings: [{ itemId: P1, assetId: 'a1', seconds: 20, takes: 1 }] });

      expect(result.error).toBeInstanceOf(RecordingRefusal);
      expect((result.error as RecordingRefusal).code).toBe('RA_RECORDING_NOT_FOUND');
      expect(ai.precheck).not.toHaveBeenCalled();
    });

    it('rehearses the passages recorded so far and says which words the reading reached', async () => {
      const passage = doc.prompts[0]!.text.split(/\s+/);
      // The learner read the first passage and left out its last two words.
      const heard = passage.slice(0, -2).map((text, i) => ({ text, passageIndex: 0, startMs: i * 300, endMs: i * 300 + 250 }));
      const { check, ai } = setup({
        ...reading(),
        assets: [asset('a1')],
        outcome: ok({ summary: '', items: [], words: heard }),
      });

      const result = await check({ recordings: [{ itemId: P1, assetId: 'a1', seconds: 20, takes: 1 }] });

      const subject = ai.precheck.mock.calls[0]![0].subject;
      expect(subject).toMatchObject({ template: 'read_aloud', prompts: [{ itemId: P1, assetId: 'a1' }] });
      expect(result.value.reading!.prompts).toHaveLength(1);
      const [first] = result.value.reading!.prompts;
      expect(first).toMatchObject({ itemId: P1 });
      expect(first!.check.missed).toBe(2);
      expect(first!.percent).toBeLessThan(100);
      expect(result.value.reading!.prompts.some((p) => p.itemId === P2)).toBe(false);
    });
  });
});
