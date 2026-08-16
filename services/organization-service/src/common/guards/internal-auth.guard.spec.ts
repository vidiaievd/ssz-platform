import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard.js';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function makeConfig(token: string | undefined) {
  return { get: jest.fn().mockReturnValue(token) } as never;
}

describe('InternalAuthGuard', () => {
  it('allows a request carrying the configured token', () => {
    const guard = new InternalAuthGuard(makeConfig('internal-dev-token'));
    const ctx = makeContext({ 'x-internal-token': 'internal-dev-token' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a request with no token header', () => {
    const guard = new InternalAuthGuard(makeConfig('internal-dev-token'));
    const ctx = makeContext({});

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a request with the wrong token', () => {
    const guard = new InternalAuthGuard(makeConfig('internal-dev-token'));
    const ctx = makeContext({ 'x-internal-token': 'someone-elses-token' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects every request when no token is configured (fail closed)', () => {
    const guard = new InternalAuthGuard(makeConfig(undefined));
    const ctx = makeContext({ 'x-internal-token': 'anything' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
