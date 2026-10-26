import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LlmError } from '../../domain/llm-error.js';
import type { SpeechFeatures, SpeechModelRef } from '../../domain/model-features.js';
import type { SpeechRequest } from '../../domain/speech-request.js';
import { silentWav } from '../../domain/wav.fixture.js';
import { WhisperLocalSpeechAssessor } from './whisper-local.assessor.js';

const features: SpeechFeatures = { languages: ['nb', 'nn'], wordTimings: true, pronunciation: false, maxAudioSeconds: 60 };

const model = (baseUrl: string | null = 'http://whisper:8000', over: Partial<SpeechFeatures> = {}): SpeechModelRef => ({
  providerModelId: 'nb-whisper-small-verbatim',
  features: { ...features, ...over },
  provider: { code: 'whisper-local', baseUrl, apiVersion: null, credentialRef: null },
});

const request = (over: Partial<SpeechRequest> = {}): SpeechRequest => ({
  audio: { format: 'wav', data: silentWav(4_000) },
  referenceText: 'Jeg heter Ola, og jeg bor i Bergen.',
  language: 'nb',
  pronunciation: true,
  timeoutMs: 5_000,
  ...over,
});

const transcript = {
  text: 'Jeg heter Ola, og jeg bor i Bergen.',
  words: [
    { text: 'Jeg', startMs: 300, endMs: 520, probability: 0.98 },
    { text: 'heter', startMs: 540, endMs: 800, probability: 0.95 },
    { text: 'Ola,', startMs: 820, endMs: 1100, probability: 0.9 },
    { text: '–', startMs: 1100, endMs: 1150, probability: 0.2 },
    { text: 'og', startMs: 1200, endMs: 1300, probability: 0.97 },
    { text: 'Bergen.', startMs: 1900, endMs: 2400, probability: 0.93 },
  ],
  durationMs: 4_010,
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('WhisperLocalSpeechAssessor', () => {
  const whisper = new WhisperLocalSpeechAssessor();
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const failure = (promise: Promise<unknown>) => promise.then(() => null, (err: unknown) => err as LlmError);

  it('sends the WAV, the model and Whisper’s language code — and not the passage', async () => {
    fetchMock.mockResolvedValue(json(transcript, { headers: { 'x-request-id': 'req-1' } }));
    const audio = silentWav(4_000);
    await whisper.assess(request({ audio: { format: 'wav', data: audio } }), model('http://whisper:8000/'));

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://whisper:8000/v1/transcribe?model=nb-whisper-small-verbatim&language=no');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(audio);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/wav');
    expect(url.toString()).not.toMatch(/Bergen/);
  });

  it('keeps a base path of the sidecar URL', async () => {
    fetchMock.mockResolvedValue(json(transcript));
    await whisper.assess(request(), model('http://gw/whisper'));
    expect((fetchMock.mock.calls[0] as [URL])[0].toString()).toMatch(/^http:\/\/gw\/whisper\/v1\/transcribe\?/);
  });

  it('maps Nynorsk to `nn`', async () => {
    fetchMock.mockResolvedValue(json(transcript));
    await whisper.assess(request({ language: 'nn' }), model());
    expect((fetchMock.mock.calls[0] as [URL])[0].searchParams.get('language')).toBe('nn');
  });

  it('returns the words in lexical form, drops punctuation-only ones, bills the WAV length', async () => {
    fetchMock.mockResolvedValue(json(transcript, { headers: { 'x-request-id': 'req-1' } }));
    const result = await whisper.assess(request(), model());

    expect(result.words.map((w) => w.text)).toEqual(['jeg', 'heter', 'ola', 'og', 'bergen']);
    expect(result.transcript).toBe('jeg heter ola og bergen');
    expect(result.words[0]).toEqual({ text: 'jeg', startMs: 300, endMs: 520, confidence: 0.98 });
    expect(result.audioMs).toBe(4_000);
    expect(result.pronunciation).toBeNull();
    expect(result.providerRequestId).toBe('req-1');
  });

  it('an empty recording is an empty transcript, not an error', async () => {
    fetchMock.mockResolvedValue(json({ text: '', words: [], durationMs: 4_000 }));
    const result = await whisper.assess(request(), model());
    expect(result.words).toEqual([]);
    expect(result.transcript).toBe('');
  });

  describe('refuses before the call', () => {
    it('without a baseUrl — not configured', async () => {
      const err = await failure(whisper.assess(request(), model(null)));
      expect(err).toMatchObject({ code: 'auth', retryable: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('audio that is not a WAV', async () => {
      const err = await failure(whisper.assess(request({ audio: { format: 'wav', data: new Uint8Array(64) } }), model()));
      expect(err).toMatchObject({ code: 'invalid_request' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('audio over the model’s limit', async () => {
      const err = await failure(whisper.assess(request({ audio: { format: 'wav', data: silentWav(61_000) } }), model()));
      expect(err).toMatchObject({ code: 'invalid_request' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a language the model does not list, or Whisper has no code for', async () => {
      expect(await failure(whisper.assess(request({ language: 'en' }), model()))).toMatchObject({ code: 'invalid_request' });
      expect(
        await failure(whisper.assess(request({ language: 'xx' }), model(undefined, { languages: ['xx'] }))),
      ).toMatchObject({ code: 'invalid_request' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('reads the sidecar’s failures as the router expects', () => {
    it.each([
      [503, 'overloaded', true],
      [500, 'unavailable', true],
      [404, 'unavailable', true],
      [400, 'invalid_request', false],
      [413, 'invalid_request', false],
      [418, 'unknown', false],
    ])('%i → %s', async (status, code, retryable) => {
      fetchMock.mockResolvedValue(json({ error: 'x' }, { status }));
      const err = await failure(whisper.assess(request(), model()));
      expect(err).toBeInstanceOf(LlmError);
      expect(err).toMatchObject({ code, retryable });
    });

    it('503 carries Retry-After', async () => {
      fetchMock.mockResolvedValue(json({ error: 'busy' }, { status: 503, headers: { 'retry-after': '2' } }));
      expect(await failure(whisper.assess(request(), model()))).toMatchObject({ retryAfterMs: 2_000 });
    });

    it('our timeout → timeout', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      expect(await failure(whisper.assess(request(), model()))).toMatchObject({ code: 'timeout', retryable: true });
    });

    it('nobody listening → unavailable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }));
      const err = await failure(whisper.assess(request(), model()));
      expect(err).toMatchObject({ code: 'unavailable', retryable: true });
      expect(err?.message).toMatch(/ECONNREFUSED/);
    });

    it('an answer without words → unknown', async () => {
      fetchMock.mockResolvedValue(json({ error: 'odd' }));
      expect(await failure(whisper.assess(request(), model()))).toMatchObject({ code: 'unknown' });
    });
  });
});

describe('WhisperLocalSpeechAssessor over a real socket', () => {
  let server: Server;
  let baseUrl: string;
  let received: { url: string; type: string | undefined; bytes: number } | null = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        received = { url: req.url ?? '', type: req.headers['content-type'], bytes: Buffer.concat(chunks).length };
        res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': String(req.headers['x-request-id']) });
        res.end(JSON.stringify(transcript));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('posts the whole recording and reads the answer', async () => {
    const audio = silentWav(4_000);
    const result = await new WhisperLocalSpeechAssessor().assess(request({ audio: { format: 'wav', data: audio } }), model(baseUrl));
    expect(received).toEqual({
      url: '/v1/transcribe?model=nb-whisper-small-verbatim&language=no',
      type: 'audio/wav',
      bytes: audio.length,
    });
    expect(result.transcript).toBe('jeg heter ola og bergen');
    expect(result.providerRequestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
