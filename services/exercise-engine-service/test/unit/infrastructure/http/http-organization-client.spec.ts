import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpOrganizationClient } from '../../../../src/infrastructure/http/http-organization-client.js';
import { OrganizationClientError } from '../../../../src/shared/application/ports/organization-client.port.js';

const makeAxiosError = (status: number, message: string): AxiosError => {
  const err = new AxiosError(message);
  err.response = {
    status,
    data: { message },
    statusText: String(status),
    headers: {},
    config: {} as any,
  };
  return err;
};

const mockHttpService = { get: jest.fn() };

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, unknown> = {
      organization: { baseUrl: 'http://org:3002', timeoutMs: 2000, retries: 2 },
      internalServiceToken: 'test-token',
    };
    return map[key];
  }),
};

const makeClient = () =>
  new HttpOrganizationClient(mockHttpService as any, mockConfig as any);

describe('HttpOrganizationClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns Result.ok with member role on success', async () => {
    mockHttpService.get.mockReturnValue(of({ data: { role: 'teacher' } }));
    const client = makeClient();

    const result = await client.getMemberRole('school-1', 'user-1');

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({ role: 'teacher' });
    expect(mockHttpService.get).toHaveBeenCalledWith(
      'http://org:3002/api/v1/internal/schools/school-1/members/user-1/role',
      expect.objectContaining({
        headers: { 'x-internal-token': 'test-token' },
      }),
    );
  });

  it('returns Result.fail with 404 when user is not a member', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => makeAxiosError(404, 'Not found')));
    const client = makeClient();

    const result = await client.getMemberRole('school-1', 'unknown-user');

    expect(result.isFail).toBe(true);
    expect(result.error).toBeInstanceOf(OrganizationClientError);
    expect((result.error as OrganizationClientError).statusCode).toBe(404);
    expect(result.error.message).toContain('not a member');
  });

  it('returns Result.fail on 500 server error', async () => {
    mockHttpService.get.mockReturnValue(throwError(() => makeAxiosError(500, 'Server error')));
    const client = makeClient();

    const result = await client.getMemberRole('school-1', 'user-1');

    expect(result.isFail).toBe(true);
    expect((result.error as OrganizationClientError).statusCode).toBe(500);
  });

  it('returns Result.fail with status 500 on network error', async () => {
    const networkErr = new AxiosError('Network Error');
    mockHttpService.get.mockReturnValue(throwError(() => networkErr));
    const client = makeClient();

    const result = await client.getMemberRole('school-1', 'user-1');

    expect(result.isFail).toBe(true);
    expect((result.error as OrganizationClientError).statusCode).toBe(500);
  });
});
