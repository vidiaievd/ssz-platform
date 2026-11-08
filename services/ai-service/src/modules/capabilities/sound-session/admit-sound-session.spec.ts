import type { ConfigService } from '@nestjs/config';
import type { GateGrant } from '../../access/application/access-gate.js';
import type { FeatureEntitlement } from '../../access/domain/entitlement.js';
import type { AdmissionFailure, AiGateway } from '../../gateway/application/ai-gateway.js';
import { Result } from '../../../shared/kernel/result.js';
import { AdmitSoundSessionCommand, type AdmitSoundSessionRequest } from './application/admit-sound-session/admit-sound-session.command.js';
import { AdmitSoundSessionHandler } from './application/admit-sound-session/admit-sound-session.handler.js';
import type { ISoundSessionLimiter, SessionBeginDecision } from './application/ports/sound-session.limiter.js';

const LEARNER = 'b0000000-0000-4000-8000-000000000002';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const PERIOD_END = new Date('2026-12-01T00:00:00.000Z');

const feature = (monthlyCredits: string | null): FeatureEntitlement => ({
  enabled: true,
  monthlyCredits,
  limits: {},
  periodStart: new Date('2026-11-01T00:00:00.000Z'),
  periodEnd: PERIOD_END,
});

const metered = (limitMicro: bigint, usedMicro: bigint): GateGrant => ({
  allowedRegions: null,
  feature: feature(String(limitMicro / 1_000_000n)),
  quota: { key: {} as never, limitMicro, usedMicro },
});

function setup(standing: Result<GateGrant, AdmissionFailure>, begin: SessionBeginDecision = { allowed: true }) {
  const asked: Array<{ capability: string; payer: unknown }> = [];
  const begun: string[] = [];
  const gateway = {
    standing: async (capability: string, payer: unknown) => {
      asked.push({ capability, payer });
      return standing;
    },
  } as unknown as AiGateway;
  const limiter: ISoundSessionLimiter = {
    begin: async (userId) => {
      begun.push(userId);
      return begin;
    },
    take: async () => true,
  };
  const config = { get: () => ({ dailyLimit: 3, takeLimit: 40, estimatedCredits: '15' }) } as unknown as ConfigService;
  const handler = new AdmitSoundSessionHandler(gateway, limiter, config as never);
  const admit = (over: Partial<AdmitSoundSessionRequest> = {}) =>
    handler.execute(new AdmitSoundSessionCommand({ userId: LEARNER, schoolId: null, resume: false, ...over }));
  return { admit, asked, begun };
}

describe('AdmitSoundSessionHandler (plan 86, step 14.1)', () => {
  it("admits a learner on their own plan with what is left of ai.practice and the session's estimate", async () => {
    const { admit, asked, begun } = setup(Result.ok(metered(20_000_000n, 7_250_000n)));
    expect(await admit()).toEqual({
      status: 'admitted',
      budget: {
        payer: 'learner',
        metered: true,
        remainingCredits: '12.750000',
        estimatedCredits: '15.000000',
        periodEnd: PERIOD_END.toISOString(),
      },
    });
    expect(asked).toEqual([{ capability: 'practice_voice', payer: { type: 'user', id: LEARNER } }]);
    expect(begun).toEqual([LEARNER]);
  });

  it('asks the school when the school pays, and says nothing is metered for an unmetered pool', async () => {
    const { admit, asked } = setup(Result.ok({ allowedRegions: null, feature: feature(null), quota: null }));
    expect(await admit({ schoolId: SCHOOL })).toMatchObject({
      status: 'admitted',
      budget: { payer: 'school', metered: false, remainingCredits: null, periodEnd: null },
    });
    expect(asked[0]!.payer).toEqual({ type: 'workspace', id: SCHOOL });
  });

  it('leaves the remainder unknown when the counter could not be read, still metered', async () => {
    const { admit } = setup(Result.ok({ allowedRegions: null, feature: feature('20'), quota: null }));
    expect(await admit()).toMatchObject({ status: 'admitted', budget: { metered: true, remainingCredits: null } });
  });

  it('refuses past the day’s sessions, with the time to the next day', async () => {
    const { admit } = setup(Result.ok(metered(20_000_000n, 0n)), { allowed: false, retryAfterMs: 3_600_000 });
    expect(await admit()).toEqual({ status: 'refused', reason: 'session_limit', retryAfterMs: 3_600_000 });
  });

  it.each([
    ['an empty pool', { kind: 'refused', code: 'quota_exhausted' }, 'pool_empty'],
    ['a plan without the key', { kind: 'refused', code: 'not_entitled' }, 'not_available'],
    ['AI switched off by the payer', { kind: 'refused', code: 'ai_disabled' }, 'not_available'],
    ['the agent switched off', { kind: 'disabled', binding: null }, 'not_available'],
  ])('refuses %s before counting a session of the day', async (_name, failure, reason) => {
    const { admit, begun } = setup(Result.fail(failure as AdmissionFailure));
    expect(await admit()).toEqual({ status: 'refused', reason, retryAfterMs: null });
    expect(begun).toEqual([]);
  });

  it('fails when the gate cannot read the payer', async () => {
    const { admit } = setup(Result.fail({ kind: 'gate_unavailable', binding: {} as never }));
    expect(await admit()).toEqual({ status: 'failed', errorCode: 'gate_unavailable' });
  });

  it('a resumed session is not counted and not refused for the day or an empty pool', async () => {
    const limited = setup(Result.ok(metered(20_000_000n, 0n)), { allowed: false, retryAfterMs: 1 });
    expect((await limited.admit({ resume: true })).status).toBe('admitted');
    expect(limited.begun).toEqual([]);

    const empty = setup(Result.fail({ kind: 'refused', code: 'quota_exhausted', binding: {} as never }));
    expect(await empty.admit({ resume: true })).toMatchObject({
      status: 'admitted',
      budget: { metered: true, remainingCredits: '0.000000' },
    });
  });
});
