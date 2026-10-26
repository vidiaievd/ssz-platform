import { LlmError } from '../../domain/llm-error.js';
import type { SpeechFeatures, SpeechModelRef } from '../../domain/model-features.js';
import type { SpeechRequest } from '../../domain/speech-request.js';
import { silentWav } from '../../domain/wav.fixture.js';
import { AzureSpeechAssessor } from './azure-speech.assessor.js';

const features: SpeechFeatures = { languages: ['nb', 'en'], wordTimings: true, pronunciation: true, maxAudioSeconds: 30 };

const model = (over: { baseUrl?: string | null; credentialRef?: string | null; features?: Partial<SpeechFeatures> } = {}): SpeechModelRef => ({
  providerModelId: 'pronunciation-assessment',
  features: { ...features, ...over.features },
  provider: {
    code: 'azure-speech',
    baseUrl: over.baseUrl === undefined ? 'https://norwayeast.stt.speech.microsoft.com' : over.baseUrl,
    apiVersion: null,
    credentialRef: over.credentialRef === undefined ? 'AZURE_SPEECH_KEY_TEST' : over.credentialRef,
  },
});

const request = (over: Partial<SpeechRequest> = {}): SpeechRequest => ({
  audio: { format: 'wav', data: silentWav(4_000) },
  referenceText: 'Jeg heter Ola, og jeg bor i Bergen.',
  language: 'nb',
  pronunciation: true,
  timeoutMs: 5_000,
  ...over,
});

/** The REST answer with miscue on: scores on the result and the words themselves. */
const assessed = {
  RecognitionStatus: 'Success',
  Offset: 3_000_000,
  Duration: 21_000_000,
  NBest: [
    {
      Confidence: 0.91,
      Lexical: 'jeg heter ola og jeg bor bergen',
      AccuracyScore: 82,
      FluencyScore: 74,
      CompletenessScore: 88,
      PronScore: 79.5,
      Words: [
        { Word: 'jeg', Offset: 3_000_000, Duration: 2_200_000, AccuracyScore: 98, ErrorType: 'None' },
        { Word: 'heter', Offset: 5_400_000, Duration: 2_600_000, AccuracyScore: 91, ErrorType: 'None' },
        { Word: 'Ola', Offset: 8_200_000, Duration: 2_800_000, AccuracyScore: 55, ErrorType: 'Mispronunciation' },
        { Word: 'og', Offset: 12_000_000, Duration: 1_000_000, AccuracyScore: 97, ErrorType: 'None' },
        { Word: 'jeg', Offset: 13_200_000, Duration: 1_500_000, AccuracyScore: 95, ErrorType: 'None' },
        { Word: 'bor', Offset: 14_900_000, Duration: 1_800_000, AccuracyScore: 93, ErrorType: 'None' },
        { Word: 'i', AccuracyScore: 0, ErrorType: 'Omission' },
        { Word: 'Bergen', Offset: 17_000_000, Duration: 5_000_000, AccuracyScore: 88, ErrorType: 'None' },
      ],
    },
  ],
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('AzureSpeechAssessor', () => {
  const azure = new AzureSpeechAssessor();
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env['AZURE_SPEECH_KEY_TEST'] = 'secret-key';
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env['AZURE_SPEECH_KEY_TEST'];
  });

  const failure = (promise: Promise<unknown>) => promise.then(() => null, (err: unknown) => err as LlmError);

  it('sends the WAV with the key, the locale and the passage in the assessment header', async () => {
    fetchMock.mockResolvedValue(json(assessed, { headers: { 'x-requestid': 'req-1' } }));
    const audio = silentWav(4_000);
    await azure.assess(request({ audio: { format: 'wav', data: audio } }), model({ baseUrl: 'https://norwayeast.stt.speech.microsoft.com/' }));

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'https://norwayeast.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1' +
        '?language=nb-NO&format=detailed&wordLevelTimestamps=true',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBe(audio);
    const headers = init.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('secret-key');
    expect(headers['Content-Type']).toBe('audio/wav; codecs=audio/pcm; samplerate=16000');
    const assessment = JSON.parse(Buffer.from(headers['Pronunciation-Assessment']!, 'base64').toString('utf8'));
    expect(assessment).toEqual({
      ReferenceText: 'Jeg heter Ola, og jeg bor i Bergen.',
      GradingSystem: 'HundredMark',
      Granularity: 'Word',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
    });
  });

  it('gives the words heard without omissions, with timings, and the scores as feedback', async () => {
    fetchMock.mockResolvedValue(json(assessed, { headers: { 'x-requestid': 'req-1' } }));
    const result = await azure.assess(request(), model());

    expect(result.transcript).toBe('jeg heter ola og jeg bor bergen');
    expect(result.words[0]).toEqual({ text: 'jeg', startMs: 300, endMs: 520, confidence: null });
    expect(result.words.map((w) => w.text)).not.toContain('i');
    expect(result.pronunciation).toEqual({
      accuracy: 82,
      fluency: 74,
      completeness: 88,
      prosody: null,
      words: expect.arrayContaining([
        { text: 'ola', accuracy: 55, error: 'mispronunciation' },
        { text: 'i', accuracy: 0, error: 'omission' },
      ]),
    });
    expect(result.pronunciation?.words).toHaveLength(8);
    expect(result.audioMs).toBe(4_000);
    expect(result.providerRequestId).toBe('req-1');
  });

  it('reads the Speech SDK shape too — scores under PronunciationAssessment, insertions heard', async () => {
    fetchMock.mockResolvedValue(
      json({
        RecognitionStatus: 'Success',
        NBest: [
          {
            Lexical: 'jeg jeg heter',
            PronunciationAssessment: { AccuracyScore: 90, FluencyScore: 80, CompletenessScore: 100, ProsodyScore: 70 },
            Words: [
              { Word: 'jeg', Offset: '1000000', Duration: '1000000', PronunciationAssessment: { AccuracyScore: 99, ErrorType: 'None' } },
              { Word: 'jeg', Offset: '2000000', Duration: '1000000', PronunciationAssessment: { AccuracyScore: 0, ErrorType: 'Insertion' } },
              { Word: 'heter', Offset: '3000000', Duration: '1000000', PronunciationAssessment: { AccuracyScore: 120, ErrorType: 'UnexpectedBreak' } },
            ],
          },
        ],
      }),
    );
    const result = await azure.assess(request({ referenceText: 'Jeg heter' }), model());

    expect(result.transcript).toBe('jeg jeg heter');
    expect(result.words[1]).toEqual({ text: 'jeg', startMs: 200, endMs: 300, confidence: null });
    expect(result.pronunciation).toMatchObject({ accuracy: 90, fluency: 80, completeness: 100, prosody: 70 });
    expect(result.pronunciation?.words.map((w) => [w.error, w.accuracy])).toEqual([
      ['none', 99],
      ['insertion', 0],
      // A prosody error is not a reading error; scores are clamped to 0–100.
      ['none', 100],
    ]);
  });

  it('without pronunciation: plain recognition, no passage sent, no scores', async () => {
    fetchMock.mockResolvedValue(
      json({
        RecognitionStatus: 'Success',
        NBest: [{ Lexical: 'jeg heter ola', Confidence: 0.9, Words: [{ Word: 'jeg', Offset: 0, Duration: 1_000_000, Confidence: 0.95 }] }],
      }),
    );
    const result = await azure.assess(request({ pronunciation: false }), model());

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Pronunciation-Assessment']).toBeUndefined();
    expect(result.pronunciation).toBeNull();
    expect(result.words).toEqual([{ text: 'jeg', startMs: 0, endMs: 100, confidence: 0.95 }]);
  });

  it('does not send the passage to a model without the feature', async () => {
    fetchMock.mockResolvedValue(json({ RecognitionStatus: 'Success', NBest: [{ Lexical: 'Jeg heter', Words: [] }] }));
    const result = await azure.assess(request(), model({ features: { pronunciation: false } }));

    const headers = (fetchMock.mock.calls[0] as [URL, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Pronunciation-Assessment']).toBeUndefined();
    expect(result.pronunciation).toBeNull();
    expect(result.transcript).toBe('jeg heter');
  });

  it.each(['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout'])('hears nothing on %s', async (status) => {
    fetchMock.mockResolvedValue(json({ RecognitionStatus: status }));
    const result = await azure.assess(request(), model());
    expect(result).toMatchObject({ transcript: '', words: [], pronunciation: null, audioMs: 4_000 });
  });

  it('fails as unknown on a recognition error status', async () => {
    fetchMock.mockResolvedValue(json({ RecognitionStatus: 'Error' }));
    expect((await failure(azure.assess(request(), model())))?.code).toBe('unknown');
  });

  it('refuses before the call: no key, no endpoint, not a WAV, too long, a language Azure lacks', async () => {
    delete process.env['AZURE_SPEECH_KEY_TEST'];
    expect((await failure(azure.assess(request(), model())))?.code).toBe('auth');
    process.env['AZURE_SPEECH_KEY_TEST'] = 'secret-key';

    expect((await failure(azure.assess(request(), model({ baseUrl: null }))))?.code).toBe('auth');
    expect((await failure(azure.assess(request({ audio: { format: 'wav', data: new Uint8Array(10) } }), model())))?.code).toBe(
      'invalid_request',
    );
    // The REST limit holds even when the registry promises more.
    const long = request({ audio: { format: 'wav', data: silentWav(31_000) } });
    expect((await failure(azure.assess(long, model({ features: { maxAudioSeconds: 120 } }))))?.code).toBe('invalid_request');
    expect((await failure(azure.assess(request({ language: 'nn' }), model({ features: { languages: ['nb', 'nn'] } }))))?.code).toBe(
      'invalid_request',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [400, 'invalid_request', false],
    [408, 'timeout', true],
    [429, 'rate_limited', true],
    [500, 'unavailable', true],
    [503, 'unavailable', true],
  ])('maps HTTP %i to %s (retryable: %s)', async (status, code, retryable) => {
    fetchMock.mockResolvedValue(new Response('nope', { status, headers: { 'retry-after': '3' } }));
    const err = await failure(azure.assess(request(), model()));
    expect(err).toBeInstanceOf(LlmError);
    expect(err?.code).toBe(code);
    expect(err?.retryable).toBe(retryable);
    if (status === 429) expect(err?.retryAfterMs).toBe(3_000);
  });

  it('maps a timeout and a dead connection', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    expect((await failure(azure.assess(request(), model())))?.code).toBe('timeout');

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') }));
    const err = await failure(azure.assess(request(), model()));
    expect(err?.code).toBe('unavailable');
    expect(err?.message).toContain('ENOTFOUND');
  });
});
