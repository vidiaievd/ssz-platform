import { LlmError } from '../../domain/llm-error.js';
import type { SpeechFeatures, SpeechModelRef } from '../../domain/model-features.js';
import type { SpeechRequest } from '../../domain/speech-request.js';
import { silentWav } from '../../domain/wav.fixture.js';
import { FakeSpeechAssessor } from './fake-speech.assessor.js';

const PASSAGE = 'Jeg heter Ola, og jeg bor i Bergen. Jeg liker å gå tur i fjellet.';
const WORDS = ['jeg', 'heter', 'ola', 'og', 'jeg', 'bor', 'i', 'bergen', 'jeg', 'liker', 'å', 'gå', 'tur', 'i', 'fjellet'];

const features: SpeechFeatures = { languages: ['nb'], wordTimings: true, pronunciation: true, maxAudioSeconds: 60 };

const model = (providerModelId = 'fake-speech', over: Partial<SpeechFeatures> = {}): SpeechModelRef => ({
  providerModelId,
  features: { ...features, ...over },
  provider: { code: 'fake', baseUrl: null, apiVersion: null, credentialRef: null },
});

const request = (over: Partial<SpeechRequest> = {}): SpeechRequest => ({
  audio: { format: 'wav', data: silentWav(9_000) },
  referenceText: PASSAGE,
  language: 'nb',
  pronunciation: false,
  timeoutMs: 5_000,
  ...over,
});

describe('FakeSpeechAssessor', () => {
  const fake = new FakeSpeechAssessor();

  it('hears the passage in lexical form, short of every 8th word, and bills the WAV length', async () => {
    const result = await fake.assess(request(), model());
    expect(result.words.map((w) => w.text)).toEqual(WORDS.filter((_, i) => (i + 1) % 8 !== 0));
    expect(result.transcript).toBe(result.words.map((w) => w.text).join(' '));
    expect(result.audioMs).toBe(9_000);
    expect(result.pronunciation).toBeNull();
    expect(result.providerRequestId).toMatch(/^fake_/);
  });

  it('answers the same request the same way', async () => {
    const [a, b] = await Promise.all([fake.assess(request(), model()), fake.assess(request(), model())]);
    expect(a.words).toEqual(b.words);
  });

  it('times the words in order, without overlap', async () => {
    const { words } = await fake.assess(request(), model());
    for (const [i, w] of words.entries()) {
      expect(w.endMs).toBeGreaterThan(w.startMs);
      if (i > 0) expect(w.startMs).toBeGreaterThanOrEqual(words[i - 1]!.endMs);
    }
  });

  it('picks the scenario from the model id, the marker winning', async () => {
    expect((await fake.assess(request(), model('fake-speech-perfect'))).words).toHaveLength(WORDS.length);
    expect((await fake.assess(request(), model('fake-speech-misses'))).words).toHaveLength(10);
    const silent = await fake.assess(request({ referenceText: `${PASSAGE} @fake:silence` }), model('fake-speech-perfect'));
    expect(silent).toMatchObject({ transcript: '', words: [] });
    await expect(fake.assess(request({ referenceText: '@fake:nonsense' }), model())).rejects.toThrow('Unknown fake speech scenario');
  });

  it('raises the failures as LlmError, retryable where the router would retry', async () => {
    await expect(fake.assess(request(), model('fake-speech-rate-limited'))).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
    await expect(fake.assess(request(), model('fake-speech-auth'))).rejects.toMatchObject({ code: 'auth', retryable: false });
  });

  it('refuses what a real provider would: not a WAV, too long, a language it does not list', async () => {
    const refused = (r: SpeechRequest, m = model()) => fake.assess(r, m).catch((e: unknown) => e);
    for (const err of [
      await refused(request({ audio: { format: 'wav', data: new Uint8Array([0, 1, 2]) } })),
      await refused(request(), model('fake-speech', { maxAudioSeconds: 5 })),
      await refused(request({ language: 'sv' })),
    ]) {
      expect(err).toBeInstanceOf(LlmError);
      expect(err).toMatchObject({ code: 'invalid_request' });
    }
  });

  it('scores pronunciation only when asked and the model can, omitted words at zero', async () => {
    expect((await fake.assess(request({ pronunciation: true }), model('fake-speech', { pronunciation: false }))).pronunciation).toBeNull();
    const { pronunciation } = await fake.assess(request({ pronunciation: true }), model());
    expect(pronunciation!.words).toHaveLength(WORDS.length);
    expect(pronunciation!.words[7]).toEqual({ text: 'bergen', accuracy: 0, error: 'omission' });
    expect(pronunciation!.completeness).toBe(Math.round((14 * 100) / 15));
    expect(pronunciation!.prosody).toBeNull();
  });

  it('leaves word times at zero for a model without timings', async () => {
    const { words } = await fake.assess(request(), model('fake-speech', { wordTimings: false }));
    expect(words.every((w) => w.startMs === 0 && w.endMs === 0)).toBe(true);
  });
});
