import { Grant } from './grant.js';

const now = new Date('2026-10-21T10:00:00.000Z');
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

const issue = (over: Partial<Parameters<typeof Grant.issue>[0]> = {}) =>
  Grant.issue({
    id: 'g1',
    accountId: 'acc',
    featureKey: 'ai.review_direct',
    monthlyCredits: '50',
    limits: {},
    startsAt: now,
    endsAt: later(30),
    reason: '  paid pilot  ',
    by: 'admin',
    now,
    ...over,
  });

describe('Grant', () => {
  it('is active from its start to its end', () => {
    const g = issue().value;
    expect(g.snapshot.reason).toBe('paid pilot');
    expect(g.stateAt(later(-1))).toBe('scheduled');
    expect(g.stateAt(now)).toBe('active');
    expect(g.stateAt(later(30))).toBe('ended');
  });

  it('checks the key like a plan feature does', () => {
    expect(issue({ featureKey: 'ai.telepathy' }).error).toEqual({ code: 'unknown_feature_key', featureKey: 'ai.telepathy' });
    expect(issue({ monthlyCredits: '-3' }).error).toEqual({ code: 'invalid_credits', featureKey: 'ai.review_direct', value: '-3' });
    expect(issue({ monthlyCredits: null }).isOk).toBe(true);
  });

  it('needs a reason and a term that ends after it starts and after now', () => {
    expect(issue({ reason: '   ' }).error).toEqual({ code: 'grant_reason_required' });
    expect(issue({ endsAt: now }).error).toEqual({ code: 'invalid_grant_period' });
    expect(issue({ startsAt: later(-60), endsAt: later(-30) }).error).toEqual({ code: 'invalid_grant_period' });
    expect(issue({ startsAt: later(5), endsAt: later(35) }).isOk).toBe(true);
  });

  it('revokes once, and not after it ended', () => {
    const g = issue().value;
    expect(g.revoke('admin2', later(1)).isOk).toBe(true);
    expect(g.snapshot).toMatchObject({ revokedBy: 'admin2', revokedAt: later(1) });
    expect(g.stateAt(later(2))).toBe('revoked');
    expect(g.revoke('admin2', later(2)).error).toEqual({ code: 'grant_already_revoked', grantId: 'g1' });
    expect(issue().value.revoke('admin', later(31)).error).toEqual({ code: 'grant_ended', grantId: 'g1' });
  });
});
