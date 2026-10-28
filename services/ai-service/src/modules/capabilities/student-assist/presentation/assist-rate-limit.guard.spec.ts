import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { AssistRateDecision, IAssistRateLimiter } from '../application/ports/assist-rate-limiter.js';
import { AssistRateLimitGuard } from './assist-rate-limit.guard.js';

function setup(decision: AssistRateDecision) {
  const headers: Record<string, string> = {};
  const taken: string[] = [];
  const limiter: IAssistRateLimiter = {
    take: async (userId) => {
      taken.push(userId);
      return decision;
    },
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId: 'u1', roles: ['student'], isPlatformAdmin: false } }),
      getResponse: () => ({ setHeader: (name: string, value: string) => (headers[name] = value) }),
    }),
  } as unknown as ExecutionContext;
  return { guard: new AssistRateLimitGuard(limiter), ctx, headers, taken };
}

describe('AssistRateLimitGuard', () => {
  it('lets a message within the window through, counted against the learner', async () => {
    const { guard, ctx, taken } = setup({ allowed: true });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(taken).toEqual(['u1']);
  });

  it('answers 429 with Retry-After in whole seconds beyond it', async () => {
    const { guard, ctx, headers } = setup({ allowed: false, retryAfterMs: 61_200 });
    const err = await guard.canActivate(ctx).catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(headers['Retry-After']).toBe('62');
  });
});
