import { jest } from '@jest/globals';
import { SAMPLE_PROMPT_IDS, sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/read-aloud';
import { SentenceCheckCommand } from '../../../src/modules/attempts/application/commands/sentence-check/sentence-check.command.js';
import { SentenceCheckHandler } from '../../../src/modules/attempts/application/commands/sentence-check/sentence-check.handler.js';
import { RecordingRefusal } from '../../../src/modules/attempts/application/services/read-aloud-recordings.js';
import { AiPrecheckClientError } from '../../../src/shared/application/ports/ai-precheck-client.port.js';
import type { AiSentenceCheckOutcome } from '../../../src/shared/application/ports/ai-precheck-client.port.js';
import type { MediaAssetDescription } from '../../../src/shared/application/ports/media-assets.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

const [P1] = SAMPLE_PROMPT_IDS;
const doc = sampleDocument();
const document = { content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) };
const passage = doc.prompts[0]!.text;
const firstWords = passage.split(/\s+/).slice(0, 3).join(' ');

const asset = (over: Partial<MediaAssetDescription> = {}): MediaAssetDescription => ({
  id: 'a1',
  ownerId: 'user-1',
  entityType: 'submission_recording',
  entityId: 'att-1',
  status: 'READY',
  mimeType: 'audio/webm',
  sizeBytes: 60_000,
  durationMs: 3_000,
  ...over,
});

function setup(opts: {
  attempt?: Record<string, unknown>;
  settings?: { enabled: boolean } | null | Error;
  assets?: MediaAssetDescription[];
  outcome?: AiSentenceCheckOutcome | AiPrecheckClientError;
} = {}) {
  const attempt = {
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    status: 'IN_PROGRESS',
    schoolId: 'school-1',
    ...opts.attempt,
  };
  const ai = {
    sentenceCheck: jest.fn((_r: unknown) => {
      const o = opts.outcome ?? ({ status: 'ok', feedback: { summary: '', items: [], words: [] }, aiCallIds: ['c1'] } as AiSentenceCheckOutcome);
      return Promise.resolve(o instanceof AiPrecheckClientError ? Result.fail(o) : Result.ok(o));
    }),
  };
  const media = { describe: jest.fn(() => Promise.resolve(Result.ok(opts.assets ?? [asset()]))) };
  const settings = {
    schoolAiPrecheck: jest.fn(() => {
      const s = opts.settings === undefined ? { enabled: true } : opts.settings;
      return s instanceof Error ? Promise.reject(s) : Promise.resolve(s);
    }),
  };
  const handler = new SentenceCheckHandler(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { findById: jest.fn(() => Promise.resolve(attempt)) } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok({ exercise: document }))) } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings as any,
    ai,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    media as any,
  );
  const run = (over: { sentence?: string; itemId?: string; userId?: string } = {}) =>
    handler.execute(
      new SentenceCheckCommand('att-1', over.userId ?? 'user-1', over.itemId ?? P1!, over.sentence ?? firstWords, 'a1', null),
    );
  return { run, ai, media };
}

describe('SentenceCheckHandler (plan 86, step 6g)', () => {
  it('sends a sentence of the passage with the take to ai-service and gives its outcome back', async () => {
    const { run, ai } = setup();
    const result = await run();
    expect(result.isOk && result.value).toMatchObject({ attemptId: 'att-1', itemId: P1, status: 'ok' });
    expect(ai.sentenceCheck).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', exerciseId: 'ex-1', language: 'nb', sentence: firstWords, recordingAssetId: 'a1' }),
    );
  });

  it('lets a learner with no school drill on their own plan', async () => {
    const { run, ai } = setup({ attempt: { schoolId: null } });
    expect((await run()).isOk).toBe(true);
    expect(ai.sentenceCheck).toHaveBeenCalledWith(expect.objectContaining({ schoolId: null }));
  });

  it('refuses a sentence that is not in the passage, before media or ai-service', async () => {
    const { run, ai, media } = setup();
    const result = await run({ sentence: 'Dette står ikke i teksten i det hele tatt' });
    expect(result.error).toEqual({ code: 'SENTENCE_NOT_IN_PASSAGE' });
    expect(media.describe).not.toHaveBeenCalled();
    expect(ai.sentenceCheck).not.toHaveBeenCalled();
  });

  it('refuses another learner’s attempt and one no longer in progress', async () => {
    expect((await setup().run({ userId: 'someone-else' })).error).toEqual({ code: 'FORBIDDEN' });
    expect((await setup({ attempt: { status: 'SUBMITTED' } }).run()).error).toEqual({ code: 'NOT_IN_PROGRESS' });
    expect((await setup({ attempt: { templateCode: 'writing_task' } }).run()).error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  it('respects the school’s switch and an unreadable setting', async () => {
    expect((await setup({ settings: { enabled: false } }).run()).error).toEqual({ code: 'PRECHECK_NOT_AVAILABLE', reason: 'disabled' });
    expect((await setup({ settings: new Error('down') }).run()).error).toEqual({ code: 'PRECHECK_ACCESS_UNKNOWN' });
  });

  it.each([
    ['not theirs', { ownerId: 'someone-else' }, 'RA_RECORDING_NOT_FOUND'],
    ['of another attempt', { entityId: 'att-2' }, 'RA_RECORDING_NOT_FOUND'],
    ['failed', { status: 'FAILED' as const }, 'RA_RECORDING_FAILED'],
    ['unfinished', { status: 'PENDING_UPLOAD' as const, durationMs: null }, 'RA_RECORDING_NOT_READY'],
  ])('refuses a take that is %s before its id goes to ai-service', async (_n, over, code) => {
    const { run, ai } = setup({ assets: [asset(over)] });
    const result = await run();
    expect(result.error).toBeInstanceOf(RecordingRefusal);
    expect((result.error as RecordingRefusal).code).toBe(code);
    expect(ai.sentenceCheck).not.toHaveBeenCalled();
  });

  it('answers ai_unavailable when ai-service does not answer, and passes a refusal through', async () => {
    const down = await setup({ outcome: new AiPrecheckClientError(503, 'down') }).run();
    expect(down.isOk && down.value).toMatchObject({ status: 'failed', errorCode: 'ai_unavailable' });
    const limit = await setup({ outcome: { status: 'refused', reason: 'attempt_limit', retryAfterMs: 5000 } }).run();
    expect(limit.isOk && limit.value).toMatchObject({ status: 'refused', reason: 'attempt_limit', retryAfterMs: 5000 });
  });
});
