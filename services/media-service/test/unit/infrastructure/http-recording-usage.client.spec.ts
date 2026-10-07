import { HttpRecordingUsageClient } from '../../../src/infrastructure/http-recording-usage.client.js';

const SINCE = new Date('2026-09-07T00:00:00Z');

function make() {
  const config = {
    get: (key: string) =>
      key === 'exerciseEngine' ? { baseUrl: 'http://engine:3006/', timeoutMs: 1000 } : 'tok',
  };
  return new HttpRecordingUsageClient(config as never);
}

function respond(status: number, body: unknown) {
  global.fetch = jest.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as never;
}

describe('HttpRecordingUsageClient (plan 71)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks the engine under its /api/v1 prefix with the internal token', async () => {
    respond(200, { inUse: ['a'] });

    const result = await make().inUse(['a', 'b'], SINCE);

    expect(result.isOk && [...result.value]).toEqual(['a']);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]!;
    expect(url).toBe('http://engine:3006/api/v1/internal/attempts/recordings/in-use');
    expect((init as RequestInit).headers).toMatchObject({ 'x-internal-token': 'tok' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      assetIds: ['a', 'b'],
      liveDraftSince: SINCE.toISOString(),
    });
  });

  it('does not ask about nothing', async () => {
    global.fetch = jest.fn() as never;

    const result = await make().inUse([], SINCE);

    expect(result.isOk && result.value.size).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['a 5xx', 503, {}, 'ENGINE_UNAVAILABLE'],
    ['a 404 (a missing prefix must not read as "nothing in use")', 404, {}, 'ENGINE_REFUSED'],
    ['a 401', 401, {}, 'ENGINE_REFUSED'],
    ['an answer of the wrong shape', 200, { inUse: 'a' }, 'ENGINE_BAD_ANSWER'],
    ['an answer that is not JSON', 200, '<html>', 'ENGINE_BAD_ANSWER'],
  ])('is an error, never an empty answer, on %s', async (_name, status, body, code) => {
    respond(status as number, body);

    const result = await make().inUse(['a'], SINCE);

    expect(result.isFail && result.error).toBe(code);
  });

  it('is an error when the engine cannot be reached', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as never;

    const result = await make().inUse(['a'], SINCE);

    expect(result.isFail && result.error).toBe('ENGINE_UNAVAILABLE');
  });
});
