import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpMediaAssetsClient } from '../../../../src/infrastructure/http/http-media-assets-client.js';
import { MediaAssetsError } from '../../../../src/shared/application/ports/media-assets.port.js';

const makeAxiosError = (status: number | null, message: string): AxiosError => {
  const err = new AxiosError(message);
  if (status !== null) {
    err.response = {
      status,
      data: { message },
      statusText: String(status),
      headers: {},
      config: {} as any,
    };
  }
  return err;
};

const mockHttpService = { post: jest.fn() };

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, unknown> = {
      media: { baseUrl: 'http://media-service:3004', timeoutMs: 2000 },
      internalServiceToken: 'test-token',
    };
    return map[key];
  }),
};

const makeClient = () => new HttpMediaAssetsClient(mockHttpService as any, mockConfig as any);

const described = {
  id: 'a1',
  ownerId: 'user-1',
  entityType: 'submission_recording',
  entityId: 'attempt-1',
  status: 'READY',
  mimeType: 'audio/webm',
  sizeBytes: 60000,
  durationMs: 20000,
};

describe('HttpMediaAssetsClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks the prefixed internal route with the service token, each id once', async () => {
    mockHttpService.post.mockReturnValue(of({ data: [described] }));

    const result = await makeClient().describe(['a1', 'a2', 'a1']);

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual([described]);
    expect(mockHttpService.post).toHaveBeenCalledWith(
      'http://media-service:3004/api/v1/internal/media/assets/describe',
      { ids: ['a1', 'a2'] },
      expect.objectContaining({ headers: { 'x-internal-token': 'test-token' }, timeout: 2000 }),
    );
  });

  it('does not call for an empty list', async () => {
    const result = await makeClient().describe([]);
    expect(result.isOk).toBe(true);
    expect(result.value).toEqual([]);
    expect(mockHttpService.post).not.toHaveBeenCalled();
  });

  it('reports media-service away as 503', async () => {
    mockHttpService.post.mockReturnValue(throwError(() => makeAxiosError(null, 'connect ECONNREFUSED')));

    const result = await makeClient().describe(['a1']);

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(MediaAssetsError);
    expect(result.error.statusCode).toBe(503);
  });

  it('passes an answered refusal through with its status', async () => {
    mockHttpService.post.mockReturnValue(throwError(() => makeAxiosError(401, 'Invalid or missing x-internal-token')));

    const result = await makeClient().describe(['a1']);

    expect(result.error.statusCode).toBe(401);
  });
});
