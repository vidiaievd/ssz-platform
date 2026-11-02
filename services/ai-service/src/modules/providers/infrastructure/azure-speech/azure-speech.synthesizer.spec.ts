import { LlmError } from '../../domain/llm-error.js';
import type { TtsModelRef } from '../../domain/model-features.js';
import type { SynthesisRequest } from '../../domain/synthesis-request.js';
import { readWav } from '../../domain/wav.js';
import { silentWav } from '../../domain/wav.fixture.js';
import { AzureSpeechSynthesizer, ssmlOf } from './azure-speech.synthesizer.js';

const model = (over: { baseUrl?: string | null; maxCharacters?: number } = {}): TtsModelRef => ({
  providerModelId: 'neural',
  features: {
    languages: ['nb'],
    voices: { nb: ['nb-NO-PernilleNeural', 'nb-NO-FinnNeural', 'nb-NO-IselinNeural'] },
    maxCharacters: over.maxCharacters ?? 400,
  },
  provider: {
    code: 'azure-tts',
    baseUrl: over.baseUrl === undefined ? 'https://norwayeast.tts.speech.microsoft.com' : over.baseUrl,
    apiVersion: null,
    credentialRef: 'AZURE_SPEECH_KEY_TEST',
  },
});

const request = (over: Partial<SynthesisRequest> = {}): SynthesisRequest => ({
  text: 'Nå sier jeg bønder igjen.',
  language: 'nb',
  voice: null,
  timeoutMs: 5_000,
  ...over,
});

const wav = (body: Uint8Array, init: ResponseInit = {}) =>
  new Response(body as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'audio/x-wav' }, ...init });

describe('AzureSpeechSynthesizer', () => {
  const azure = new AzureSpeechSynthesizer();
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env['AZURE_SPEECH_KEY_TEST'] = 'secret-key';
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env['AZURE_SPEECH_KEY_TEST'];
  });

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => null,
      (err: unknown) => err as LlmError,
    );

  it('posts SSML with the key and asks for the WAV the recognizers take', async () => {
    fetchMock.mockResolvedValue(wav(silentWav(1_200), { headers: { 'x-requestid': 'tts-1' } }));
    await azure.synthesize(request(), model({ baseUrl: 'https://norwayeast.tts.speech.microsoft.com/' }));

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://norwayeast.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('secret-key');
    expect(headers['Content-Type']).toBe('application/ssml+xml');
    expect(headers['X-Microsoft-OutputFormat']).toBe('riff-16khz-16bit-mono-pcm');
    expect(init.body).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="nb-NO">' +
        '<voice name="nb-NO-PernilleNeural">Nå sier jeg bønder igjen.</voice></speak>',
    );
  });

  it('gives the clip, its length, the voice and the characters billed', async () => {
    fetchMock.mockResolvedValue(wav(silentWav(1_200), { headers: { 'x-requestid': 'tts-1' } }));
    const result = await azure.synthesize(request({ voice: 'nb-NO-FinnNeural' }), model());
    expect(readWav(result.audio.data)?.sampleRate).toBe(16_000);
    expect(result).toMatchObject({
      audioMs: 1_200,
      voice: 'nb-NO-FinnNeural',
      characters: 25,
      providerRequestId: 'tts-1',
    });
  });

  it('escapes the text: the caller cannot smuggle in markup', () => {
    expect(ssmlOf('<break/> & "x"', 'nb-NO', 'v')).toContain(
      '<voice name="v">&lt;break/&gt; &amp; &quot;x&quot;</voice>',
    );
  });

  it('refuses before the call a voice it does not have, an empty text and one over the limit', async () => {
    expect((await failure(azure.synthesize(request({ voice: 'nb-NO-Unknown' }), model())))?.code).toBe(
      'invalid_request',
    );
    expect((await failure(azure.synthesize(request({ language: 'nn' }), model())))?.code).toBe('invalid_request');
    expect((await failure(azure.synthesize(request({ text: '  ' }), model())))?.code).toBe('invalid_request');
    expect((await failure(azure.synthesize(request(), model({ maxCharacters: 10 }))))?.code).toBe('invalid_request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not configured without a key or an endpoint', async () => {
    delete process.env['AZURE_SPEECH_KEY_TEST'];
    expect((await failure(azure.synthesize(request(), model())))?.code).toBe('auth');
    process.env['AZURE_SPEECH_KEY_TEST'] = 'secret-key';
    expect((await failure(azure.synthesize(request(), model({ baseUrl: null }))))?.code).toBe('auth');
  });

  it('maps the provider’s statuses like recognition does', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota', { status: 429, headers: { 'retry-after': '2' } }));
    const limited = await failure(azure.synthesize(request(), model()));
    expect(limited).toMatchObject({ code: 'rate_limited', retryAfterMs: 2_000 });
    expect(limited?.message).toContain('Azure TTS 429');

    fetchMock.mockResolvedValueOnce(new Response('bad ssml', { status: 400 }));
    expect((await failure(azure.synthesize(request(), model())))?.code).toBe('invalid_request');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect((await failure(azure.synthesize(request(), model())))?.code).toBe('unavailable');
  });

  it('is a timeout when the call is aborted, and unknown when the answer is not a WAV', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    expect((await failure(azure.synthesize(request(), model())))?.code).toBe('timeout');
    fetchMock.mockResolvedValueOnce(wav(new TextEncoder().encode('not audio')));
    expect((await failure(azure.synthesize(request(), model())))?.code).toBe('unknown');
  });
});
