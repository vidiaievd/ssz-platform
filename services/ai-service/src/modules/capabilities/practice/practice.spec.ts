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
import type { RecordingAudio } from '../voice-review/application/ports/recording-audio.source.js';
import type { ReadAloudSubject } from '../voice-review/domain/read-aloud-subject.js';
import type { SpeechGatewayRequest } from '../../gateway/application/model-router.js';
import type { SpeechResult } from '../../providers/domain/speech-result.js';
import { practiceUnaskable, toPracticeSubject } from './application/practice-subject.js';
import { PrecheckCommand, type PracticeSubject } from './application/precheck/precheck.command.js';
import { PRECHECK_SURFACE, PrecheckHandler } from './application/precheck/precheck.handler.js';
import { practiceSchema, toAiFeedback, verifyPractice } from './domain/practice-feedback.js';
import { toVoiceFeedback } from './domain/voice-feedback.js';
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

const reading = (over: Partial<ReadAloudSubject> = {}): ReadAloudSubject => ({
  template: 'read_aloud',
  targetLanguage: 'nb',
  passPercent: 80,
  ai: { on: true, checks: { transcript: true, pronunciation: true, fluency: false } },
  prompts: [
    { itemId: 'p1', label: '1', text: 'Jeg heter Kari.', focus: [], assetId: 'asset-1', seconds: 3 },
    { itemId: 'p2', label: '2', text: 'Hun bor i Bergen.', focus: [], assetId: 'asset-2', seconds: 3 },
  ],
  carriedItemIds: [],
  ...over,
});

const heardAs = (texts: string[], scored?: Array<{ text: string; accuracy: number; error: 'none' | 'mispronunciation' | 'omission' | 'insertion' }>) => ({
  words: texts.map((text, i) => ({ text, startMs: i * 500, endMs: i * 500 + 400, confidence: 0.9 })),
  pronunciation: scored ? { accuracy: 80, fluency: 0, completeness: 90, prosody: null, words: scored } : null,
});

describe('voice feedback (domain)', () => {
  it('gives every word heard, passage by passage, with its timings and the accuracy beside it', () => {
    const feedback = toVoiceFeedback([
      {
        passageIndex: 0,
        heard: heardAs(['jeg', 'kari'], [
          { text: 'jeg', accuracy: 95, error: 'none' },
          { text: 'heter', accuracy: 0, error: 'omission' },
          { text: 'kari', accuracy: 40, error: 'mispronunciation' },
        ]),
      },
      { passageIndex: 1, heard: heardAs(['hun']) },
    ]);
    expect(feedback.summary).toBe('');
    expect(feedback.items).toEqual([]);
    expect(feedback.words).toEqual([
      { text: 'jeg', passageIndex: 0, accuracy: 95, startMs: 0, endMs: 400, phonemes: [] },
      { text: 'kari', passageIndex: 0, accuracy: 40, startMs: 500, endMs: 900, phonemes: [] },
      { text: 'hun', passageIndex: 1, startMs: 0, endMs: 400, phonemes: [] },
    ]);
  });

  it('gives no accuracy when the scores cannot be paired with the words heard', () => {
    const feedback = toVoiceFeedback([{ passageIndex: 0, heard: heardAs(['jeg', 'heter', 'kari'], [{ text: 'jeg', accuracy: 95, error: 'none' }]) }]);
    expect(feedback.words!.every((w) => w.accuracy === undefined)).toBe(true);
  });
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

  const WAV = new Uint8Array([1, 2, 3]);

  function setup(
    call: GatewayCall,
    language: () => Promise<string | null> = async () => 'ru',
    voice: { heard?: (n: number) => unknown; audio?: (assetId: string, n: number) => RecordingAudio | Error } = {},
  ) {
    const calls: Array<{ capability: string; context: CallContext; request: GatewayRequest }> = [];
    const speech: Array<{ capability: string; context: CallContext; request: SpeechGatewayRequest }> = [];
    const fetched: string[] = [];
    const gateway = {
      call: async (capability: string, context: CallContext, input: GatewayInput) => {
        const request = typeof input === 'function' ? input('practice@1') : input;
        calls.push({ capability, context, request });
        return call;
      },
      callSpeech: async (capability: string, context: CallContext, request: SpeechGatewayRequest) => {
        speech.push({ capability, context, request });
        const n = speech.length;
        const routed = voice.heard?.(n) ?? Result.ok({ result: heardAs([`w${n}`]) as SpeechResult });
        return { routed, recorded: { callId: `speech-${n}`, cost: null, credits: '0.01' }, latencyMs: 5 };
      },
    } as unknown as AiGateway;
    const schools: ISchoolLanguageReader = { explanationLanguage: language } as ISchoolLanguageReader;
    const recordings = {
      fetch: async (assetId: string): Promise<RecordingAudio> => {
        fetched.push(assetId);
        const audio = voice.audio?.(assetId, fetched.length) ?? { kind: 'ready', wav: WAV };
        if (audio instanceof Error) throw audio;
        return audio;
      },
    };
    const handler = new PrecheckHandler(gateway, new SchoolPayerResolver(), schools, recordings, [0, 0]);
    const run = (subject: PracticeSubject) =>
      handler.execute(new PrecheckCommand({ schoolId: SCHOOL, userId: LEARNER, exerciseId: EXERCISE, attemptId: ATTEMPT, subject }));
    return { run, calls, speech, fetched };
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
    expect(await run({ template: 'match_pairs' } as unknown as PracticeSubject)).toMatchObject({ reason: 'template_not_supported' });
    expect(calls).toHaveLength(0);
  });

  describe('a reading aloud (step 2c)', () => {
    it('hears every passage with practice_voice as the school, and gives the words back', async () => {
      const { run, calls, speech } = setup(answered({}));
      const outcome = await run(reading());
      expect(outcome).toMatchObject({ status: 'ok', aiCallIds: ['speech-1', 'speech-2'] });
      expect(outcome.status === 'ok' && outcome.feedback.words!.map((w) => [w.text, w.passageIndex])).toEqual([
        ['w1', 0],
        ['w2', 1],
      ]);
      expect(calls).toHaveLength(0);
      expect(speech.map((s) => s.capability)).toEqual(['practice_voice', 'practice_voice']);
      expect(speech[0]!.context).toEqual({
        payer: { type: 'workspace', id: SCHOOL },
        actor: { userId: LEARNER, role: 'student' },
        surface: PRECHECK_SURFACE,
      });
      expect(speech[1]!.request).toEqual({ audio: { format: 'wav', data: WAV }, referenceText: 'Hun bor i Bergen.', language: 'nb', pronunciation: true });
    });

    it('waits a little for a take media is still converting', async () => {
      const { run, fetched } = setup(answered({}), undefined, { audio: (_id, n) => (n === 1 ? { kind: 'pending' } : { kind: 'ready', wav: WAV }) });
      expect((await run(reading())).status).toBe('ok');
      expect(fetched).toEqual(['asset-1', 'asset-2', 'asset-1']);
    });

    it.each([
      ['missing', () => ({ kind: 'missing' }) as RecordingAudio, 'recording_missing'],
      ['never ready', () => ({ kind: 'pending' }) as RecordingAudio, 'recording_not_ready'],
      ['unreadable', () => new Error('media down'), 'recording_unreadable'],
    ])('pays for nothing when a take is %s', async (_label, audio, errorCode) => {
      const { run, speech } = setup(answered({}), undefined, { audio });
      expect(await run(reading())).toEqual({ status: 'failed', errorCode, aiCallIds: [] });
      expect(speech).toHaveLength(0);
    });

    it('stops at the first passage not heard, with the calls made so far', async () => {
      const { run, speech } = setup(answered({}), undefined, {
        heard: (n) => (n === 1 ? Result.fail({ kind: 'refused', code: 'quota_exhausted', attempts: [] }) : undefined),
      });
      expect(await run(reading())).toEqual({ status: 'refused', reason: 'pool_empty', detail: null });
      expect(speech).toHaveLength(1);
    });

    it('has nothing to hear when the machine may not check the reading', async () => {
      const { run, speech } = setup(answered({}));
      expect(await run(reading({ ai: { on: false, checks: { transcript: false, pronunciation: false, fluency: false } } }))).toEqual({
        status: 'refused',
        reason: 'unaskable',
        detail: 'machine_cannot_check',
      });
      expect(speech).toHaveLength(0);
    });
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
