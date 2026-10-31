import { ValidationPipe } from '@nestjs/common';
import type { AiGateway, GatewayCall } from '../../gateway/application/ai-gateway.js';
import type { GatewayInput, GatewayRequest } from '../../gateway/application/model-router.js';
import type { CallContext } from '../../ledger/domain/ai-call.js';
import { Result } from '../../../shared/kernel/result.js';
import type {
  ErrorCorrectionSubject,
  ShortAnswerSubject,
  TranslateSubject,
  WritingTaskSubject,
} from '../review-draft/application/ports/review-attempts.client.js';
import type { ISchoolLanguageReader } from '../review-draft/application/ports/school-language.reader.js';
import { SchoolPayerResolver } from '../review-draft/application/school-payer.resolver.js';
import type { ReadAloudSubject } from '../voice-review/domain/read-aloud-subject.js';
import { practiceUnaskable, toPracticeSubject } from './application/practice-subject.js';
import { PrecheckCommand, type PracticeSubject } from './application/precheck/precheck.command.js';
import { PRECHECK_SURFACE, PrecheckHandler } from './application/precheck/precheck.handler.js';
import { practiceSchema, toAiFeedback, verifyPractice } from './domain/practice-feedback.js';
import { practiceRequest } from './prompts/prompts.js';
import { PrecheckRequestDto } from './presentation/precheck.dto.js';

// Plan 84, step 2.

const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const LEARNER = 'b0000000-0000-4000-8000-000000000002';
const EXERCISE = 'c0000000-0000-5000-8000-000000000003';
const ATTEMPT = 'a0000000-0000-4000-8000-000000000001';

const translate = (answer = 'Jeg bor her i tre år'): TranslateSubject => ({
  template: 'translate',
  langs: { explain: 'Russisk', target: 'Norsk' },
  ai: { on: true, checks: { grammar: true, lexis: true } },
  sentences: [
    { itemId: 's1', direction: 'to_target', source: 'Я живу здесь три года.', refs: ['Jeg har bodd her i tre år'], answer },
  ],
});

const errorCorrection = (checks: ErrorCorrectionSubject['ai']['checks'], answer = 'Jeg liker ikke å kjører bilen.'): ErrorCorrectionSubject => ({
  template: 'error_correction',
  targetLanguage: 'nb',
  note: '',
  ai: { on: true, checks },
  sentences: [
    {
      itemId: 's1',
      given: 'Jeg liker ikke å kjører bil.',
      refs: ['Jeg liker ikke å kjøre bil.'],
      answer,
      matchesKey: false,
      mistakes: [{ wrong: 'kjører', fix: 'kjøre', type: 'grammar', state: 'missed', submitted: 'kjører' }],
      stray: [],
    },
  ],
});

const essay = (): WritingTaskSubject => ({
  template: 'writing_task',
  targetLanguage: 'nb',
  mode: 'free',
  instruction: 'Skriv om helgen din.',
  prompt: '',
  source: '',
  letter: null,
  imageCaption: '',
  points: [{ text: 'Hva gjorde du?', required: true, keywords: [], phrased: false, ticked: false }],
  example: 'I helgen var jeg på hytta.',
  length: { words: 5, paragraphs: 1, minWords: 50, maxWords: 120 },
  ai: { on: true, checks: { grammar: true, task: true, draft: true } },
  rubric: [{ id: 'c1', name: 'Innhold', weight: 1, levels: ['0', '1', '2', '3'] }] as unknown as WritingTaskSubject['rubric'],
  text: 'I helgen jeg var hjemme.',
});

const shortAnswer = (): ShortAnswerSubject => ({
  template: 'short_answer',
  targetLanguage: 'nb',
  instruction: '',
  ai: { on: true, checks: {} },
  questions: [
    {
      itemId: 'q1',
      kind: 'reading',
      passage: 'Kari bor i Bergen.',
      prompt: 'Hvor bor Kari?',
      model: 'I Bergen.',
      why: '',
      elements: [{ label: 'Bergen', required: true, hit: false }],
      verdict: 'fail',
      tooShort: false,
      answer: 'Hun bor i Oslo.',
    },
  ],
});

const reading = (): ReadAloudSubject => ({
  template: 'read_aloud',
  targetLanguage: 'nb',
  passPercent: 80,
  ai: { on: true, checks: { transcript: true, pronunciation: false, fluency: false } },
  prompts: [{ itemId: 'p1', label: '1', text: 'Jeg heter Kari.', focus: [], assetId: 'asset-1', seconds: 3 }],
  carriedItemIds: [],
});

describe('practice feedback (domain)', () => {
  const frame = toPracticeSubject(translate(), 'ru').input;

  it('asks for hints without a corrected text, each with a severity, and a summary', () => {
    const schema = practiceSchema(frame) as {
      required: string[];
      properties: { items: { items: { required: string[]; properties: Record<string, unknown> } } };
    };
    expect(schema.required).toEqual(['items', 'summary']);
    expect(schema.properties.items.items.required).toEqual(['sentenceIndex', 'aspect', 'fragment', 'comment', 'severity']);
    expect(schema.properties.items.items.properties).not.toHaveProperty('suggestion');
  });

  it('refuses a quotation the learner did not write, and a blank summary', () => {
    const verify = verifyPractice(frame);
    const remark = { sentenceIndex: 1, aspect: 'grammar', comment: 'Время?', severity: 'major' };
    expect(verify({ items: [{ ...remark, fragment: 'har bodd' }], summary: 'Почти.' })).toMatch(/does not occur/);
    expect(verify({ items: [], summary: '  ' })).toBe('summary is blank');
    expect(verify({ items: [{ ...remark, fragment: 'bor' }], summary: 'Почти.' })).toBeNull();
  });

  it('points a remark at its answer and at the quotation in it; atomRef stays null', () => {
    const feedback = toAiFeedback(
      {
        items: [
          { sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: ' Какое время? ', severity: 'major' },
          { sentenceIndex: 1, aspect: 'lexis', fragment: null, comment: 'x', severity: 'minor' },
        ],
        summary: ' Почти. ',
      },
      frame,
    );
    expect(feedback).toEqual({
      summary: 'Почти.',
      items: [
        { kind: 'grammar', target: { passageIndex: 0, span: [4, 7] }, original: 'bor', explanation: 'Какое время?', atomRef: null, severity: 'major' },
        { kind: 'lexis', target: { passageIndex: 0 }, explanation: 'x', atomRef: null, severity: 'minor' },
      ],
    });
  });
});

describe('practice subject', () => {
  it('drops what only a teacher acts on: alternative remarks and rubric marks', () => {
    const ec = toPracticeSubject(errorCorrection({ explainWhy: true, altFixes: true }), null);
    expect(ec.input.aspects).toEqual(['grammar', 'order', 'lexis']);
    const wt = toPracticeSubject(essay(), null);
    expect(wt.template === 'writing_task' && wt.input.rubric).toBeNull();
    expect(toPracticeSubject(shortAnswer(), null).input.aspects).toEqual(['content']);
  });

  it('has nothing to ask when only alternatives were switched on, or the answer is empty', () => {
    expect(practiceUnaskable(errorCorrection({ altFixes: true }))).toBe('no_checks');
    expect(practiceUnaskable(translate('  '))).toBe('empty_answer');
    expect(practiceUnaskable(errorCorrection({ explainWhy: true }, 'Jeg liker ikke å kjører bil.'))).toBe('empty_answer');
    expect(practiceUnaskable(translate())).toBeNull();
  });
});

describe('practice@1 prompts', () => {
  it.each([
    ['translate', translate()],
    ['error_correction', errorCorrection({ explainWhy: true })],
    ['writing_task', essay()],
    ['short_answer', shortAnswer()],
  ] as const)('%s: a rehearsal that never hands out the fix', (template, subject) => {
    const request = practiceRequest('practice@1', toPracticeSubject(subject, 'ru')) as GatewayRequest;
    expect(request.system).toContain('This is a rehearsal');
    expect(request.system).toContain('Never write the corrected form');
    expect(request.system).toContain('in Russian');
    expect(request.system).not.toContain('alternative —');
    expect(request.responseSchema?.name).toBe(`${template}_practice`);
  });

  it('knows no other version', () => {
    expect(() => practiceRequest('practice@9', toPracticeSubject(translate(), null))).toThrow(/no prompt version/);
  });
});

describe('PrecheckHandler', () => {
  const MODEL = { model: { id: 'model-1', providerId: 'provider-1', providerModelId: 'fake-1' }, provider: { code: 'fake' } };
  const recorded = { callId: 'call-1', cost: null, credits: '0.01' };

  const answered = (data: unknown): GatewayCall =>
    ({
      routed: Result.ok({
        result: { output: { kind: 'structured', data }, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } },
        model: MODEL,
        role: 'primary',
        binding: { promptVersion: 'practice@1' },
        attempts: [],
      }),
      recorded,
      latencyMs: 5,
    }) as unknown as GatewayCall;

  const failedWith = (error: unknown): GatewayCall => ({ routed: Result.fail(error), recorded, latencyMs: 5 }) as unknown as GatewayCall;

  function setup(call: GatewayCall, language: () => Promise<string | null> = async () => 'ru') {
    const calls: Array<{ capability: string; context: CallContext; request: GatewayRequest }> = [];
    const gateway = {
      call: async (capability: string, context: CallContext, input: GatewayInput) => {
        const request = typeof input === 'function' ? input('practice@1') : input;
        calls.push({ capability, context, request });
        return call;
      },
    } as unknown as AiGateway;
    const schools: ISchoolLanguageReader = { explanationLanguage: language } as ISchoolLanguageReader;
    const handler = new PrecheckHandler(gateway, new SchoolPayerResolver(), schools);
    const run = (subject: PracticeSubject) =>
      handler.execute(new PrecheckCommand({ schoolId: SCHOOL, userId: LEARNER, exerciseId: EXERCISE, attemptId: ATTEMPT, subject }));
    return { run, calls };
  }

  it('asks practice as the school, on the precheck surface, and answers with the feedback', async () => {
    const { run, calls } = setup(
      answered({ items: [{ sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Время?', severity: 'major' }], summary: 'Почти.' }),
    );
    const outcome = await run(translate());
    expect(outcome).toEqual({
      status: 'ok',
      feedback: {
        summary: 'Почти.',
        items: [{ kind: 'grammar', target: { passageIndex: 0, span: [4, 7] }, original: 'bor', explanation: 'Время?', atomRef: null, severity: 'major' }],
      },
      aiCallIds: ['call-1'],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.capability).toBe('practice');
    expect(calls[0]!.context).toEqual({
      payer: { type: 'workspace', id: SCHOOL },
      actor: { userId: LEARNER, role: 'student' },
      surface: PRECHECK_SURFACE,
    });
  });

  it('still asks when the school language is unreadable, in the exercise’s own label', async () => {
    const { run, calls } = setup(answered({ items: [], summary: 'Ok.' }), async () => {
      throw new Error('down');
    });
    expect((await run(translate())).status).toBe('ok');
    expect(calls[0]!.request.system).toContain('in Russisk');
  });

  it('refuses without a call: nothing to ask, or a template it does not read', async () => {
    const { run, calls } = setup(answered({ items: [], summary: 'Ok.' }));
    expect(await run(translate(''))).toEqual({ status: 'refused', reason: 'unaskable', detail: 'empty_answer' });
    expect(await run(reading())).toEqual({ status: 'refused', reason: 'template_not_supported', detail: 'read_aloud' });
    expect(await run({ template: 'match_pairs' } as unknown as PracticeSubject)).toMatchObject({ reason: 'template_not_supported' });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['the pool is spent', { kind: 'refused', code: 'quota_exhausted' }, { status: 'refused', reason: 'pool_empty', detail: null }],
    ['the tariff lacks the key', { kind: 'refused', code: 'not_entitled' }, { status: 'refused', reason: 'not_available', detail: 'not_entitled' }],
    ['the agent is off', { kind: 'disabled', binding: null }, { status: 'refused', reason: 'not_available', detail: 'disabled' }],
    ['the gate cannot read', { kind: 'gate_unavailable' }, { status: 'failed', errorCode: 'gate_unavailable', aiCallIds: ['call-1'] }],
    ['the model failed', { kind: 'error', error: { code: 'timeout' } }, { status: 'failed', errorCode: 'timeout', aiCallIds: ['call-1'] }],
  ])('answers when %s', async (_label, failure, expected) => {
    const { run } = setup(failedWith({ attempts: [], ...failure }));
    expect(await run(essay())).toEqual(expected);
  });
});

describe('PrecheckRequestDto at the door', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const meta = { type: 'body' as const, metatype: PrecheckRequestDto };

  it('keeps the engine’s subject whole', async () => {
    const subject = translate();
    const body = await pipe.transform({ schoolId: SCHOOL, userId: LEARNER, exerciseId: EXERCISE, attemptId: ATTEMPT, subject }, meta);
    expect((body as PrecheckRequestDto).subject).toEqual(subject);
  });

  it('turns away a body without a subject or with a malformed id', async () => {
    await expect(pipe.transform({ schoolId: SCHOOL, userId: LEARNER, exerciseId: EXERCISE, attemptId: ATTEMPT }, meta)).rejects.toThrow();
    await expect(
      pipe.transform({ schoolId: 'x', userId: LEARNER, exerciseId: EXERCISE, attemptId: ATTEMPT, subject: translate() }, meta),
    ).rejects.toThrow();
  });
});
