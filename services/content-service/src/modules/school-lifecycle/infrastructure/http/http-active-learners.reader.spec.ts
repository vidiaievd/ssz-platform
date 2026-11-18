/* eslint-disable @typescript-eslint/require-await -- in-memory fakes of async ports */
import {
  HttpActiveLearnersReader,
  MAX_IDS,
  MAX_ITEMS,
  packQuestions,
} from './http-active-learners.reader.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('packQuestions', () => {
  it('keeps every request within learning-service caps', () => {
    const questions = Array.from({ length: 450 }, (_, i) => ({
      kind: 'lesson' as const,
      id: id(i),
      leafIds: [],
    }));
    const requests = packQuestions(questions);
    expect(requests.map((r) => r.length)).toEqual([MAX_ITEMS, MAX_ITEMS, 50]);
  });

  it('splits a container with more leaves than one request carries', () => {
    const leafIds = Array.from({ length: 4500 }, (_, i) => id(i));
    const requests = packQuestions([{ kind: 'container', id: id(99999), leafIds }]);
    expect(
      requests.every((r) => r.reduce((n, item) => n + 1 + item.leafIds.length, 0) <= MAX_IDS),
    ).toBe(true);
    expect(requests.flat().flatMap((item) => item.leafIds)).toHaveLength(4500);
    expect(new Set(requests.flat().map((item) => item.contentId))).toEqual(new Set([id(99999)]));
  });
});

describe('HttpActiveLearnersReader', () => {
  const config = {
    get: (key: string) =>
      key === 'learning' ? { baseUrl: 'http://learning:3007/', timeoutMs: 1000 } : 'svc-token',
  };
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends x-service-token to /api/v1 and keeps the largest answer of a split container', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = JSON.parse(init.body as string) as {
        items: Array<{ contentType: string; contentId: string }>;
      };
      return new Response(
        JSON.stringify({
          items: body.items.map((it, i) => ({
            ...it,
            activeLearners: calls.length === 2 && i === 0 ? 3 : 0,
          })),
        }),
        { status: 200 },
      );
    }) as never;
    const leafIds = Array.from({ length: 2500 }, (_, i) => id(i));

    const active = await new HttpActiveLearnersReader(config as never).countActive(
      [{ kind: 'container', id: id(7), leafIds }],
      new Date('2026-08-12T00:00:00Z'),
    );

    expect(calls[0].url).toBe('http://learning:3007/api/v1/internal/content/active-learners');
    expect((calls[0].init.headers as Record<string, string>)['x-service-token']).toBe('svc-token');
    expect(calls).toHaveLength(2);
    expect(active).toEqual(new Map([[`container:${id(7)}`, 3]]));
  });

  it('throws on a refusal, so nothing is deleted', async () => {
    global.fetch = jest.fn(async () => new Response('', { status: 401 })) as never;
    await expect(
      new HttpActiveLearnersReader(config as never).countActive(
        [{ kind: 'lesson', id: id(1), leafIds: [] }],
        new Date(),
      ),
    ).rejects.toThrow(/HTTP 401/);
  });
});
