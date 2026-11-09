import { ENDING_SOON_LIMIT, summariseAdminStats, type AdminStatsRows, type EndingGrant } from './admin-stats.js';

const NOW = new Date('2026-11-10T10:00:00Z');
const HORIZON = new Date('2026-11-17T10:00:00Z');

function rows(over: Partial<AdminStatsRows> = {}): AdminStatsRows {
  return {
    plans: [
      { code: 'free_individual', name: 'Free', audience: 'individual', status: 'active', currentVersion: 1 },
      { code: 'free_workspace', name: 'Free workspace', audience: 'workspace', status: 'active', currentVersion: 1 },
      { code: 'school', name: 'School', audience: 'workspace', status: 'active', currentVersion: 3 },
      { code: 'legacy', name: 'Legacy', audience: 'workspace', status: 'archived', currentVersion: 1 },
    ],
    currentSubscriptions: [
      { planCode: 'school', planVersion: 3, status: 'active', count: 4 },
      { planCode: 'school', planVersion: 2, status: 'active', count: 2 },
      { planCode: 'school', planVersion: 3, status: 'trial', count: 1 },
      { planCode: 'free_workspace', planVersion: 1, status: 'active', count: 10 },
      { planCode: 'free_individual', planVersion: 1, status: 'active', count: 50 },
    ],
    accounts: [
      { type: 'workspace', count: 20 },
      { type: 'user', count: 55 },
    ],
    grantsEnding: [],
    subscriptionsEnding: [],
    ...over,
  };
}

const grant = (i: number): EndingGrant => ({
  grantId: `g${i}`,
  accountType: 'workspace',
  externalId: 's1',
  featureKey: 'ai.practice',
  enabled: true,
  startsAt: NOW,
  endsAt: HORIZON,
});

describe('summariseAdminStats', () => {
  it('counts subscribers per plan, trials and versions newest first; a plan nobody is on is zero', () => {
    const s = summariseAdminStats(rows(), NOW, 7, HORIZON);
    expect(s.plans.find((p) => p.code === 'school')).toMatchObject({
      subscribers: 7,
      trial: 1,
      currentVersion: 3,
      byVersion: [
        { version: 3, count: 5 },
        { version: 2, count: 2 },
      ],
    });
    expect(s.plans.find((p) => p.code === 'legacy')).toMatchObject({ status: 'archived', subscribers: 0, trial: 0, byVersion: [] });
  });

  it('splits accounts per payer type into with and without a subscription', () => {
    const s = summariseAdminStats(rows(), NOW, 7, HORIZON);
    expect(s.payers.workspace).toEqual({ accounts: 20, withSubscription: 17, withoutSubscription: 3 });
    expect(s.payers.user).toEqual({ accounts: 55, withSubscription: 50, withoutSubscription: 5 });
  });

  it('answers zeros for a type with no accounts', () => {
    const s = summariseAdminStats(rows({ plans: [], currentSubscriptions: [], accounts: [] }), NOW, 7, HORIZON);
    expect(s.payers.user).toEqual({ accounts: 0, withSubscription: 0, withoutSubscription: 0 });
  });

  it('cuts an ending list at the limit and says so', () => {
    const full = Array.from({ length: ENDING_SOON_LIMIT }, (_, i) => grant(i));
    expect(summariseAdminStats(rows({ grantsEnding: full }), NOW, 7, HORIZON).endingSoon).toMatchObject({ truncated: false });
    const over = summariseAdminStats(rows({ grantsEnding: [...full, grant(999)] }), NOW, 7, HORIZON).endingSoon;
    expect(over.truncated).toBe(true);
    expect(over.grants).toHaveLength(ENDING_SOON_LIMIT);
  });

  it('echoes the window', () => {
    expect(summariseAdminStats(rows(), NOW, 7, HORIZON)).toMatchObject({ generatedAt: NOW, withinDays: 7, horizon: HORIZON });
  });
});
