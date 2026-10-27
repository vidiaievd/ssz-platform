import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { ModelCaller, NamedModelCall } from '../../../gateway/application/model-caller.js';
import { LlmError } from '../../../providers/domain/llm-error.js';
import type { SpeechFeatures } from '../../../providers/domain/model-features.js';
import type { SpeechResult } from '../../../providers/domain/speech-result.js';
import type { ModelForCall } from '../../../registry/application/ports/registry.reader.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IEvalRunRepository } from '../../review-draft/eval/application/ports/eval-run.repository.js';
import type { EvalRun, EvalRunFinish } from '../../review-draft/eval/domain/eval-run.js';
import type { IRecordingAudioSource, RecordingAudio } from '../application/ports/recording-audio.source.js';
import type { IReadingCasesClient } from './application/ports/reading-cases.client.js';
import { RunVoiceEvalCommand } from './application/run-voice-eval.command.js';
import { NO_PROMPT_VERSION, RunVoiceEvalHandler } from './application/run-voice-eval.handler.js';
import { voiceBindingMatch } from './application/voice-eval-runs.queries.js';
import { VoiceEvalRunner } from './application/voice-eval-runner.js';
import type { PromptCheck, ReadingCase } from './domain/reading-case.js';
import { READING_GATE, summarizeReadings, type PromptResult, type ReadingCaseResult, type ReadingRunScores } from './domain/reading-score.js';

// Plan 82, step 10b.

function prompt(over: Partial<PromptResult> = {}): PromptResult {
  return {
    itemId: 'p1',
    outcome: 'ok',
    errorCode: null,
    teacherApproved: true,
    machinePassed: true,
    percent: 95,
    latencyMs: 100,
    audioMs: 5_000,
    ...over,
  };
}

describe('summarizeReadings', () => {
  it('counts agreement, false passes and false fails by prompt', () => {
    const scores = summarizeReadings([
      {
        caseId: 'a',
        passPercent: 85,
        prompts: [
          prompt({ itemId: 'p1' }),
          prompt({ itemId: 'p2', teacherApproved: false, machinePassed: true, percent: 88 }),
          prompt({ itemId: 'p3', teacherApproved: true, machinePassed: false, percent: 80 }),
          prompt({ itemId: 'p4', teacherApproved: false, machinePassed: false, percent: 60 }),
        ],
      },
    ]);
    expect(scores).toMatchObject({
      cases: 1,
      casesHeard: 1,
      prompts: 4,
      heard: 4,
      agreed: 2,
      falsePass: 1,
      falseFail: 1,
      agreement: 0.5,
      falsePassRate: 0.5,
      falseFailRate: 0.5,
      readingAgreement: 1, // both say "not every prompt passed"
      meanPercentApproved: 87.5,
      meanPercentFailed: 74,
      avgLatencyMs: 100,
      audioMs: 20_000,
      gate: { ...READING_GATE, met: false },
    });
  });

  it('counts a prompt not heard on its own, never as a disagreement', () => {
    const scores = summarizeReadings([
      {
        caseId: 'a',
        passPercent: 85,
        prompts: [
          prompt(),
          prompt({ itemId: 'p2', outcome: 'skipped', errorCode: 'recording_missing', machinePassed: null, percent: null, latencyMs: 0, audioMs: null }),
          prompt({ itemId: 'p3', outcome: 'error', errorCode: 'timeout', machinePassed: null, percent: null, latencyMs: 300, audioMs: null }),
        ],
      },
    ]);
    expect(scores).toMatchObject({ heard: 1, skipped: 1, error: 1, agreed: 1, agreement: 1, casesHeard: 0, readingAgreement: null });
    expect(scores.avgLatencyMs).toBe(200); // the skipped prompt was never called
  });

  it('meets the gate at 100 heard prompts and 85 % agreement — not before', () => {
    const readings = (agreeing: number, total: number): ReadingCaseResult[] => [
      {
        caseId: 'a',
        passPercent: 85,
        prompts: Array.from({ length: total }, (_, i) => prompt({ itemId: `p${i}`, machinePassed: i < agreeing })),
      },
    ];
    expect(summarizeReadings(readings(85, 100)).gate.met).toBe(true);
    expect(summarizeReadings(readings(84, 100)).gate.met).toBe(false);
    expect(summarizeReadings(readings(99, 99)).gate.met).toBe(false);
  });

  it('has no rates over an empty run', () => {
    expect(summarizeReadings([])).toMatchObject({ agreement: null, falsePassRate: null, meanPercentApproved: null, avgLatencyMs: null });
  });
});

describe('voiceBindingMatch', () => {
  const binding = { primaryModelId: 'whisper', fallbackModelId: 'fake-speech', promptVersion: '-' };
  it('reads the model alone — a speech capability has no prompt', () => {
    expect(voiceBindingMatch({ modelId: 'whisper' }, binding)).toBe('primary');
    expect(voiceBindingMatch({ modelId: 'fake-speech' }, binding)).toBe('fallback');
    expect(voiceBindingMatch({ modelId: 'azure' }, binding)).toBeNull();
    expect(voiceBindingMatch({ modelId: 'whisper' }, null)).toBeNull();
  });
});

const features: SpeechFeatures = { languages: ['nb'], wordTimings: true, pronunciation: false, maxAudioSeconds: 120 };

function candidate(over: Partial<SpeechFeatures> = {}): ModelForCall {
  return {
    model: {
      id: 'whisper',
      providerId: 'p',
      providerCode: 'whisper-local',
      providerModelId: 'nb-whisper-small-verbatim',
      displayName: 'NB-Whisper',
      modality: 'speech',
      features: { ...features, ...over },
      status: 'active',
    },
    provider: { id: 'p', code: 'whisper-local', kind: 'whisper_local', displayName: 'Whisper', baseUrl: 'http://whisper:8000', apiVersion: null, credentialRef: null, region: 'local', enabled: true },
    currentPrice: null,
  };
}

function reading(over: Partial<ReadingCase> = {}): ReadingCase {
  return {
    caseId: 'att-1',
    decidedAt: '2026-10-26T10:00:00.000Z',
    targetLanguage: 'nb',
    passPercent: 85,
    prompts: [
      { itemId: 'i1', text: 'Jeg bor i Bergen.', assetId: 'asset-1', seconds: 4, approved: true },
      { itemId: 'i2', text: 'Jeg liker å gå tur.', assetId: 'asset-2', seconds: 5, approved: false },
    ],
    ...over,
  };
}

type Run = EvalRun<ReadingRunScores, ReadingCaseResult>;

class MemoryRuns implements IEvalRunRepository<ReadingRunScores, ReadingCaseResult> {
  readonly created: Run[] = [];
  readonly finished: Array<{ id: string; finish: EvalRunFinish<ReadingRunScores, ReadingCaseResult> }> = [];
  async create(run: Run) {
    this.created.push(run);
  }
  async finish(id: string, finish: EvalRunFinish<ReadingRunScores, ReadingCaseResult>) {
    this.finished.push({ id, finish });
    return true;
  }
  async findById() {
    return null;
  }
  async list() {
    return [];
  }
  async failRunning() {
    return 0;
  }
}

/** What the candidate hears per passage: a transcript, or a model error code. */
type Hearing = string | { error: string };

function setup(opts: {
  hearings?: Record<string, Hearing>;
  audio?: Record<string, RecordingAudio | 'down'>;
  checks?: (prompts: Array<{ itemId: string; text: string; transcript: string }>) => PromptCheck[];
  cases?: ReadingCase[] | 'down';
  skipped?: Record<string, number>;
  resolved?: ModelForCall | 'not_found' | 'not_configured';
  bound?: boolean;
}) {
  const runs = new MemoryRuns();
  const calls: Array<{ capability: string; surface: string; referenceText: string; pronunciation: boolean; bytes: number }> = [];
  const resolvedAs: string[] = [];
  const caller = {
    resolve: async (_id: string, modality: string) => {
      resolvedAs.push(modality);
      const resolved = opts.resolved ?? candidate();
      if (resolved === 'not_found') return Result.fail({ kind: 'not_found' });
      if (resolved === 'not_configured') return Result.fail({ kind: 'not_configured', missing: ['adapter whisper_local'] });
      return Result.ok(resolved);
    },
    callSpeech: async (
      capability: string,
      context: { surface: string },
      _model: ModelForCall,
      input: { referenceText: string; pronunciation: boolean; audio: { data: Uint8Array } },
    ): Promise<NamedModelCall<SpeechResult>> => {
      calls.push({ capability, surface: context.surface, referenceText: input.referenceText, pronunciation: input.pronunciation, bytes: input.audio.data.byteLength });
      const recorded = { callId: `c${calls.length}`, cost: { micros: 0, currency: 'USD' }, credits: '0.000000' };
      const heard = opts.hearings?.[input.referenceText] ?? input.referenceText.toLowerCase().replace(/[.,]/g, '');
      if (typeof heard !== 'string') {
        return { outcome: { kind: 'error', error: new LlmError(heard.error as never, heard.error), raw: null }, recorded, latencyMs: 50 };
      }
      return {
        outcome: { kind: 'ok', result: { transcript: heard, words: [], pronunciation: null, audioMs: 4_000, providerRequestId: null, latencyMs: 50 } },
        recorded,
        latencyMs: 50,
      };
    },
  } as unknown as ModelCaller;

  const recordings: IRecordingAudioSource = {
    fetch: async (assetId) => {
      const audio = opts.audio?.[assetId] ?? { kind: 'ready', wav: new Uint8Array(44) };
      if (audio === 'down') throw new Error('media-service answered 503');
      return audio;
    },
  };
  const checked: Array<{ language: string; passPercent: number; prompts: Array<{ itemId: string; text: string; transcript: string }> }> = [];
  const limits: number[] = [];
  const readings: IReadingCasesClient = {
    listCases: async (limit) => {
      limits.push(limit);
      if (opts.cases === 'down') throw new Error('engine answered 503');
      return { cases: opts.cases ?? [reading()], skipped: opts.skipped ?? {} };
    },
    check: async (language, passPercent, prompts) => {
      checked.push({ language, passPercent, prompts });
      // Default: passed when the transcript is the passage, lower-cased.
      return (
        opts.checks?.(prompts) ??
        prompts.map((p) => {
          const passed = p.transcript === p.text.toLowerCase().replace(/[.,]/g, '');
          return { itemId: p.itemId, read: passed ? 4 : 2, total: 4, percent: passed ? 100 : 50, passed };
        })
      );
    },
  };

  const runner = new VoiceEvalRunner(caller, recordings, readings, runs, 2);
  const started: Array<Promise<void>> = [];
  const spiedRunner = {
    start: (...args: Parameters<VoiceEvalRunner['start']>) => {
      const p = runner.start(...args);
      started.push(p);
      return p;
    },
  } as unknown as VoiceEvalRunner;
  const bindingsAsked: string[] = [];
  const queryBus = {
    execute: async (query: { capability: string }) => {
      bindingsAsked.push(query.capability);
      return opts.bound === false
        ? { binding: null }
        : { binding: { primaryModelId: 'whisper', fallbackModelId: null, promptVersion: 'voice@1' } };
    },
  } as unknown as QueryBus;
  const handler = new RunVoiceEvalHandler(caller, spiedRunner, queryBus, readings, runs);
  return { handler, runs, calls, checked, limits, started, resolvedAs, bindingsAsked };
}

const command = (over: { pronunciation?: boolean; limit?: number } = {}) =>
  new RunVoiceEvalCommand('whisper', over.pronunciation ?? false, over.limit ?? 50, 'admin-1');

describe('RunVoiceEvalHandler', () => {
  it('starts the run on the set and answers it running', async () => {
    const { handler, runs, limits, resolvedAs, bindingsAsked } = setup({ skipped: { NOT_READ_MODE: 2 } });
    const run = await handler.execute(command());

    expect(resolvedAs).toEqual(['speech']);
    expect(limits).toEqual([50]);
    expect(bindingsAsked).toEqual(['voice_review']);
    expect(run).toMatchObject({
      capability: 'voice_review',
      modelId: 'whisper',
      promptVersion: 'voice@1',
      status: 'running',
      startedBy: 'admin-1',
      bindingAtStart: { primaryModelId: 'whisper', fallbackModelId: null, promptVersion: 'voice@1' },
      caseCount: 1,
      skipped: { NOT_READ_MODE: 2 },
    });
    expect(runs.created).toHaveLength(1);
  });

  it('labels an unbound run with no prompt version', async () => {
    const { handler } = setup({ bound: false });
    expect((await handler.execute(command())).promptVersion).toBe(NO_PROMPT_VERSION);
  });

  it('measures for voice_review_pronunciation when asked, and refuses a model that scores none', async () => {
    const plain = setup({});
    await expect(plain.handler.execute(command({ pronunciation: true }))).rejects.toMatchObject({
      response: { missing: ['pronunciation'] },
    });

    const azure = setup({ resolved: candidate({ pronunciation: true }) });
    const run = await azure.handler.execute(command({ pronunciation: true }));
    expect(run.capability).toBe('voice_review_pronunciation');
    expect(azure.bindingsAsked).toEqual(['voice_review_pronunciation']);
  });

  it('leaves out readings in a language the model does not hear', async () => {
    const { handler } = setup({ cases: [reading(), reading({ caseId: 'att-2', targetLanguage: 'de' })] });
    const run = await handler.execute(command());
    expect(run.caseCount).toBe(1);
    expect(run.skipped).toEqual({ LANGUAGE_NOT_SUPPORTED: 1 });
  });

  it('refuses before spending: unknown, unconfigured, no word timings, empty set, engine down', async () => {
    await expect(setup({ resolved: 'not_found' }).handler.execute(command())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ resolved: 'not_configured' }).handler.execute(command())).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(setup({ resolved: candidate({ wordTimings: false }) }).handler.execute(command())).rejects.toMatchObject({
      response: { missing: ['wordTimings'] },
    });
    const empty = setup({ cases: [reading({ targetLanguage: 'de' })], skipped: { NO_DECISIONS: 1 } });
    await expect(empty.handler.execute(command())).rejects.toMatchObject({
      response: { skipped: { NO_DECISIONS: 1, LANGUAGE_NOT_SUPPORTED: 1 } },
    });
    expect(empty.runs.created).toHaveLength(0);
    await expect(setup({ cases: 'down' }).handler.execute(command())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('VoiceEvalRunner', () => {
  it("hears every take, has the engine check it, and sets the machine's ruling beside the teacher's", async () => {
    const { handler, runs, calls, checked, started } = setup({
      hearings: { 'Jeg liker å gå tur.': 'jeg liker å gå tur' }, // read right — the teacher failed it anyway
    });
    await handler.execute(command());
    await Promise.all(started);

    expect(calls).toEqual([
      { capability: 'voice_review', surface: 'admin_eval', referenceText: 'Jeg bor i Bergen.', pronunciation: false, bytes: 44 },
      { capability: 'voice_review', surface: 'admin_eval', referenceText: 'Jeg liker å gå tur.', pronunciation: false, bytes: 44 },
    ]);
    expect(checked).toEqual([
      {
        language: 'nb',
        passPercent: 85,
        prompts: [
          { itemId: 'i1', text: 'Jeg bor i Bergen.', transcript: 'jeg bor i bergen' },
          { itemId: 'i2', text: 'Jeg liker å gå tur.', transcript: 'jeg liker å gå tur' },
        ],
      },
    ]);
    const done = runs.finished[0]!.finish;
    if (done.status !== 'done') throw new Error('run failed');
    expect(done.cases[0]!.prompts.map((p) => [p.itemId, p.teacherApproved, p.machinePassed, p.percent])).toEqual([
      ['i1', true, true, 100],
      ['i2', false, true, 100],
    ]);
    expect(done.scores).toMatchObject({ heard: 2, agreed: 1, falsePass: 1, agreement: 0.5, audioMs: 8_000 });
    expect(done.cost).toEqual({ micros: 0, currency: 'USD' });
    expect(done.credits).toBe('0.000000');
  });

  it('skips a take it cannot hear and still runs the reading’s other prompts', async () => {
    const { handler, runs, calls, checked, started } = setup({
      cases: [
        reading(),
        reading({ caseId: 'att-2', prompts: [{ itemId: 'j1', text: 'Hei.', assetId: 'asset-3', seconds: 2, approved: true }] }),
        reading({ caseId: 'att-3', prompts: [{ itemId: 'k1', text: 'Lang.', assetId: 'asset-4', seconds: 300, approved: true }] }),
      ],
      audio: { 'asset-1': { kind: 'missing' }, 'asset-3': 'down' },
    });
    await handler.execute(command());
    await Promise.all(started);

    expect(calls.map((c) => c.referenceText)).toEqual(['Jeg liker å gå tur.']);
    expect(checked.map((c) => c.prompts.map((p) => p.itemId))).toEqual([['i2']]);
    const done = runs.finished[0]!.finish;
    if (done.status !== 'done') throw new Error('run failed');
    const outcomes = done.cases.flatMap((c) => c.prompts.map((p) => [p.itemId, p.outcome, p.errorCode]));
    expect(outcomes).toEqual([
      ['i1', 'skipped', 'recording_missing'],
      ['i2', 'ok', null],
      ['j1', 'skipped', 'media_unavailable'],
      ['k1', 'skipped', 'audio_too_long'],
    ]);
  });

  it('counts a model error on a prompt and checks the rest', async () => {
    const { handler, runs, checked, started } = setup({ hearings: { 'Jeg bor i Bergen.': { error: 'overloaded' } } });
    await handler.execute(command());
    await Promise.all(started);

    expect(checked[0]!.prompts.map((p) => p.itemId)).toEqual(['i2']);
    const done = runs.finished[0]!.finish;
    if (done.status !== 'done') throw new Error('run failed');
    expect(done.cases[0]!.prompts[0]).toMatchObject({ outcome: 'error', errorCode: 'overloaded', machinePassed: null, latencyMs: 50 });
    expect(done.scores.error).toBe(1);
  });

  it('asks for pronunciation scores when measuring the pronunciation level', async () => {
    const { handler, calls, started } = setup({ resolved: candidate({ pronunciation: true }) });
    await handler.execute(command({ pronunciation: true }));
    await Promise.all(started);
    expect(calls.every((c) => c.capability === 'voice_review_pronunciation' && c.pronunciation)).toBe(true);
  });

  it('fails the run when the engine cannot check what was heard', async () => {
    const { handler, runs, started } = setup({
      checks: () => {
        throw new Error('exercise-engine answered 503 to the reading check');
      },
    });
    await handler.execute(command());
    await Promise.all(started);
    expect(runs.finished[0]!.finish).toEqual({ status: 'failed', error: 'exercise-engine answered 503 to the reading check' });
  });

  it('fails the run when the check leaves a heard prompt out', async () => {
    const { handler, runs, started } = setup({ checks: (prompts) => [{ itemId: prompts[0]!.itemId, read: 4, total: 4, percent: 100, passed: true }] });
    await handler.execute(command());
    await Promise.all(started);
    expect(runs.finished[0]!.finish).toMatchObject({ status: 'failed', error: expect.stringContaining('left out prompt i2') });
  });
});
