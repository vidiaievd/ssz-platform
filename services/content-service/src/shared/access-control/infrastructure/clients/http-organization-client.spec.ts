import { of, throwError } from 'rxjs';
import { HttpOrganizationClient } from './http-organization-client.js';
import { OrganizationServiceUnavailableException } from './organization-service-unavailable.exception.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAxiosError(status: number): object {
  return { response: { status }, message: `HTTP ${status}` };
}

function makeNetworkError(): Error {
  return Object.assign(new Error('Network error'), { response: undefined });
}

function makeClient(httpGetResponses: (() => unknown)[], options = { retries: 2 }) {
  let callIndex = 0;

  const http = {
    get: jest.fn().mockImplementation(() => {
      const factory =
        httpGetResponses[callIndex++] ?? httpGetResponses[httpGetResponses.length - 1];
      const value = factory();
      if (
        value instanceof Error ||
        (typeof value === 'object' && value !== null && 'response' in value)
      ) {
        return { pipe: jest.fn().mockReturnValue(throwError(() => value)) };
      }
      return { pipe: jest.fn().mockReturnValue(of(value)) };
    }),
  };

  const config = {
    get: jest.fn().mockReturnValue({
      baseUrl: 'http://org-service',
      timeoutMs: 5000,
      retries: options.retries,
      internalAuthToken: 'secret-token',
    }),
  };

  const client = new HttpOrganizationClient(http as any, config as any);
  // Skip actual sleep to keep tests fast
  jest.spyOn(client as any, 'sleep').mockResolvedValue(undefined);
  return client;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HttpOrganizationClient.getMemberRole', () => {
  it('returns role on 200 response', async () => {
    const client = makeClient([() => ({ data: { role: 'teacher' } })]);
    const role = await client.getMemberRole('user-1', 'school-1');
    expect(role).toBe('teacher');
  });

  it('returns null on 404 (user not a member)', async () => {
    const client = makeClient([() => makeAxiosError(404)]);
    const role = await client.getMemberRole('user-1', 'school-1');
    expect(role).toBeNull();
  });

  it('retries on 500 and succeeds on subsequent attempt', async () => {
    const client = makeClient([
      () => makeAxiosError(500),
      () => makeAxiosError(500),
      () => ({ data: { role: 'student' } }),
    ]);
    const role = await client.getMemberRole('user-1', 'school-1');
    expect(role).toBe('student');
  });

  it('throws OrganizationServiceUnavailableException after all retries exhausted', async () => {
    const client = makeClient([
      () => makeAxiosError(500),
      () => makeAxiosError(500),
      () => makeAxiosError(500),
    ]);
    await expect(client.getMemberRole('user-1', 'school-1')).rejects.toThrow(
      OrganizationServiceUnavailableException,
    );
  });

  it('throws OrganizationServiceUnavailableException on persistent network errors', async () => {
    const client = makeClient([
      () => makeNetworkError(),
      () => makeNetworkError(),
      () => makeNetworkError(),
    ]);
    await expect(client.getMemberRole('user-1', 'school-1')).rejects.toThrow(
      OrganizationServiceUnavailableException,
    );
  });

  it('throws Error immediately on 401 without retrying', async () => {
    const client = makeClient([() => makeAxiosError(401)]);
    const httpSpy = (client as any).http.get as jest.Mock;
    await expect(client.getMemberRole('user-1', 'school-1')).rejects.toThrow(
      'Internal auth misconfigured',
    );
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('throws Error immediately on 403 without retrying', async () => {
    const client = makeClient([() => makeAxiosError(403)]);
    const httpSpy = (client as any).http.get as jest.Mock;
    await expect(client.getMemberRole('user-1', 'school-1')).rejects.toThrow(
      'Internal auth misconfigured',
    );
    expect(httpSpy).toHaveBeenCalledTimes(1);
  });

  it('includes Bearer token in Authorization header', async () => {
    const client = makeClient([() => ({ data: { role: 'owner' } })]);
    const httpSpy = (client as any).http.get as jest.Mock;
    await client.getMemberRole('user-1', 'school-1');
    expect(httpSpy).toHaveBeenCalledWith(
      expect.stringContaining('/schools/school-1/members/user-1/role'),
      expect.objectContaining({ headers: { Authorization: 'Bearer secret-token' } }),
    );
  });
});
