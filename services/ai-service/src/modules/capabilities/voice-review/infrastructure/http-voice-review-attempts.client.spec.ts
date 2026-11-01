import { jest } from '@jest/globals';
import type { PromptHearing } from '../application/ports/voice-review-attempts.client.js';
import { HttpVoiceReviewAttemptsClient } from './http-voice-review-attempts.client.js';

// Plan 88, step 4: the words' sounds stay in ai-service — the engine's DTO refuses unknown fields.

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
      { status: 'ready', prompts: [prompt(), prompt({ itemId: 'p2', pronunciation: null })] },
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
});
