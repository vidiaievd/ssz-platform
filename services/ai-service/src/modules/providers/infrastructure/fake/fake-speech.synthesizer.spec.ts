import type { LlmError } from '../../domain/llm-error.js';
import type { TtsModelRef } from '../../domain/model-features.js';
import { wavDurationMs } from '../../domain/wav.js';
import { FakeSpeechSynthesizer } from './fake-speech.synthesizer.js';

const model: TtsModelRef = {
  providerModelId: 'fake-tts',
  features: { languages: ['nb'], voices: { nb: ['fake-nb-1', 'fake-nb-2'] }, maxCharacters: 40 },
  provider: { code: 'fake', baseUrl: null, apiVersion: null, credentialRef: null },
};

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (err: unknown) => err as LlmError,
  );

describe('FakeSpeechSynthesizer', () => {
  const fake = new FakeSpeechSynthesizer();

  it('speaks a WAV as long as the text would take, with the default voice', async () => {
    const result = await fake.synthesize(
      { text: 'Nå sier jeg bønder.', language: 'nb', voice: null, timeoutMs: 1_000 },
      model,
    );
    expect(result).toMatchObject({ voice: 'fake-nb-1', characters: 19, audioMs: 1_330 });
    expect(wavDurationMs(result.audio.data)).toBe(1_330);
  });

  it('refuses what a real one would, and raises the failure a marker names', async () => {
    const say = (text: string, voice: string | null = null) =>
      fake.synthesize({ text, language: 'nb', voice, timeoutMs: 1 }, model);
    expect((await failure(say('hei', 'other')))?.code).toBe('invalid_request');
    expect((await failure(say('x'.repeat(41))))?.code).toBe('invalid_request');
    expect((await failure(say('hei @fake:timeout')))?.code).toBe('timeout');
    expect((await failure(say('hei @fake:rate_limited')))?.retryable).toBe(true);
  });
});
