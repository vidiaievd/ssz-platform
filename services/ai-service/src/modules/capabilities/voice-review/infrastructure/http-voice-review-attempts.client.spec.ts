import { jest } from '@jest/globals';
import type { PromptHearing } from '../application/ports/voice-review-attempts.client.js';
import { HttpVoiceReviewAttemptsClient } from './http-voice-review-attempts.client.js';

// Plan 88, step 4: Azure's phonemes stay in ai-service — the engine's DTO refuses unknown fields.
// Step 5c: the sounds named against the lexicon go in their place, and the weak ones as remarks.

const ATTEMPT = 'a0000000-0000-4000-8000-000000000088';
const META = { aiCallId: 'c0000000-0000-4000-8000-000000000001', providerId: null, modelId: null, promptVersion: null };

describe('HttpVoiceReviewAttemptsClient.putReading', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function stubFetch() {
    const bodies: unknown[] = [];
    global.fetch = jest.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ attempt: { status: 'scored', provisional: false } }), { status: 200 });
    }) as unknown as typeof fetch;
    return bodies;
  }

  const prompt = (over: Partial<PromptHearing> = {}): PromptHearing => ({
    itemId: 'p1',
    aiCallId: META.aiCallId,
    transcript: 'jeg bor',
    words: [{ text: 'jeg', startMs: 0, endMs: 300, confidence: null }],
    audioMs: 1_000,
    pronunciation: {
      accuracy: 90,
      fluency: 80,
      completeness: 100,
      prosody: null,
      words: [
        { text: 'jeg', accuracy: 95, error: 'none', phonemes: [{ startMs: 0, durationMs: 100, accuracy: 95 }] },
        { text: 'bor', accuracy: 85, error: 'none', phonemes: [] },
      ],
    },
    ...over,
  });

  it('sends the words without their sounds, everything else as heard', async () => {
    const bodies = stubFetch();
    const client = new HttpVoiceReviewAttemptsClient('http://exercise-engine:3006', 'token');
    await client.putReading(
      ATTEMPT,
      {
        status: 'ready',
        prompts: [prompt(), prompt({ itemId: 'p2', pronunciation: null })],
        remarks: [],
        summary: null,
      },
      META,
    );

    const reading = (bodies[0] as { reading: { prompts: unknown[] } }).reading;
    expect(reading.prompts).toEqual([
      {
        ...prompt(),
        pronunciation: {
          accuracy: 90,
          fluency: 80,
          completeness: 100,
          prosody: null,
          words: [
            { text: 'jeg', accuracy: 95, error: 'none' },
            { text: 'bor', accuracy: 85, error: 'none' },
          ],
        },
      },
      { ...prompt({ itemId: 'p2' }), pronunciation: null },
    ]);
  });

  it('sends the sounds named against the lexicon in place of Azure’s, and the weak ones as remarks', async () => {
    const bodies = stubFetch();
    const client = new HttpVoiceReviewAttemptsClient('http://exercise-engine:3006', 'token');
    await client.putReading(
      ATTEMPT,
      {
        status: 'ready',
        prompts: [
          prompt({
            sounds: [
              [
                { symbol: 'j', accuracy: 95 },
                { symbol: '', accuracy: 90 },
              ],
              null,
            ],
          }),
        ],
        remarks: [
          {
            itemId: 'p1',
            sentenceIndex: 1,
            wordIndex: 1,
            word: 'bor',
            comment: 'note',
            atomRef: { atomType: 'sound', atomId: 'nb:kj' },
            finding: { word: 'bor', transcription: 'buːr', family: 'kj', symbols: ['KJ'], severity: 'minor' },
          },
        ],
        summary: 'Start with kj.',
      },
      META,
    );

    const body = bodies[0] as {
      items: unknown[];
      summary: unknown;
      reading: { prompts: Array<Record<string, unknown>> };
    };
    expect(body.summary).toBe('Start with kj.');
    expect(body.reading.prompts[0]).not.toHaveProperty('sounds');
    expect((body.reading.prompts[0]!.pronunciation as { words: unknown[] }).words).toEqual([
      {
        text: 'jeg',
        accuracy: 95,
        error: 'none',
        phonemes: [
          { symbol: 'j', accuracy: 95 },
          { symbol: '', accuracy: 90 },
        ],
      },
      { text: 'bor', accuracy: 85, error: 'none' },
    ]);
    expect(body.items).toEqual([
      {
        itemId: 'p1',
        sentenceIndex: 1,
        aspect: 'pronunciation',
        fragment: 'bor',
        comment: 'note',
        suggestion: null,
        wordIndex: 1,
        atomRef: { atomType: 'sound', atomId: 'nb:kj' },
      },
    ]);
  });
});
