import { of, throwError } from 'rxjs';
import { ReviewReviewersClient } from '../../../src/modules/notifications/schedules/clients/review-reviewers.client.js';

function makeClient(statuses: Record<string, string | Error>) {
  const http = {
    get: jest.fn((url: string, _options: unknown) => {
      const id = /internal\/schools\/([^/]+)\/status$/.exec(url)?.[1] ?? '';
      const answer = statuses[id];
      return answer instanceof Error || answer === undefined
        ? throwError(() => answer ?? new Error('404'))
        : of({ data: { schoolId: id, status: answer } });
    }),
    post: jest.fn(),
  };
  const config = {
    get: jest.fn(() => ({ organizationServiceUrl: 'http://org', internalToken: 'token' })),
  };
  return { client: new ReviewReviewersClient(http as never, config as never), http };
}

describe('ReviewReviewersClient.activeOnly', () => {
  it('keeps active schools and drops suspended, closed and purged ones, in order', async () => {
    const { client, http } = makeClient({
      a: 'active',
      s: 'suspended',
      c: 'closed',
      p: 'purged',
      b: 'active',
    });

    const kept = await client.activeOnly(
      ['a', 's', 'c', 'p', 'b'].map((schoolId) => ({ schoolId, pending: 1 })),
    );

    expect(kept).toEqual([
      { schoolId: 'a', pending: 1 },
      { schoolId: 'b', pending: 1 },
    ]);
    expect(http.get).toHaveBeenCalledWith('http://org/api/v1/internal/schools/a/status', {
      headers: { 'x-internal-token': 'token' },
    });
  });

  it('drops a school whose status cannot be read (unknown or organization down)', async () => {
    const { client } = makeClient({ a: 'active', down: new Error('ECONNREFUSED') });

    expect(await client.activeOnly([{ schoolId: 'down' }, { schoolId: 'gone' }])).toEqual([]);
  });
});
