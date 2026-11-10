import type { PlanFeature } from '../../plans/domain/plan.js';
import { resolveEntitlements, studentSeatLimit, type EntitlementInputs, type ResolvablePlan } from './entitlements.js';

const NOW = new Date('2026-10-21T12:00:00Z');
const DAY = 24 * 3600 * 1000;

const f = (featureKey: string, enabled: boolean, monthlyCredits: string | null, limits: Record<string, number> = {}): PlanFeature => ({
  featureKey,
  enabled,
  monthlyCredits,
  limits,
});

const FREE_WORKSPACE: ResolvablePlan = {
  code: 'free_workspace',
  name: 'Free workspace',
  version: 1,
  features: [f('ai.review_draft', true, '50'), f('ai.student_assist', false, null)],
};

const TUTOR_PRO: ResolvablePlan = {
  code: 'tutor_pro',
  name: 'Tutor Pro',
  version: 2,
  features: [
    f('ai.review_draft', true, '1000'),
    f('ai.student_assist', true, '1000', { perLearnerMonthlyCredits: 100 }),
    f('ai.authoring', true, null),
  ],
};

function inputs(over: Partial<EntitlementInputs> = {}): EntitlementInputs {
  return {
    account: { type: 'workspace', externalId: 'school-1', revision: 4 },
    subscription: null,
    freePlan: FREE_WORKSPACE,
    grants: [],
    now: NOW,
    ...over,
  };
}

function onTutorPro(periodEnd: Date | null = null): EntitlementInputs['subscription'] {
  return { id: 'sub-1', status: 'active', periodStart: new Date('2026-09-10T00:00:00Z'), periodEnd, plan: TUTOR_PRO };
}

function grant(featureKey: string, monthlyCredits: string | null, over: Partial<EntitlementInputs['grants'][number]> = {}) {
  return {
    featureKey,
    enabled: true,
    monthlyCredits,
    limits: {},
    startsAt: new Date(NOW.getTime() - DAY),
    endsAt: new Date(NOW.getTime() + 30 * DAY),
    revokedAt: null,
    ...over,
  };
}

describe('resolveEntitlements', () => {
  it('falls back to the free plan without a subscription, counting the calendar month', () => {
    const e = resolveEntitlements(inputs());
    expect(e.source).toBe('free_plan');
    expect(e.plan).toEqual({ code: 'free_workspace', name: 'Free workspace', version: 1 });
    expect(e.subscription).toBeNull();
    expect(e.features).toEqual({
      'ai.review_draft': { enabled: true, monthlyCredits: '50', limits: {} },
      'ai.student_assist': { enabled: false, monthlyCredits: null, limits: {} },
    });
    expect(e.periodStart).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(e.periodEnd).toEqual(new Date('2026-11-01T00:00:00Z'));
    expect(e.version).toBe(4);
  });

  it("uses the subscription's plan version and its cycle", () => {
    const e = resolveEntitlements(inputs({ subscription: onTutorPro() }));
    expect(e.source).toBe('subscription');
    expect(e.plan).toEqual({ code: 'tutor_pro', name: 'Tutor Pro', version: 2 });
    expect(e.subscription).toEqual({ id: 'sub-1', status: 'active', periodStart: new Date('2026-09-10T00:00:00Z'), periodEnd: null });
    expect(e.features['ai.review_draft']).toEqual({ enabled: true, monthlyCredits: '1000', limits: {} });
    expect(e.features['ai.student_assist']!.limits).toEqual({ perLearnerMonthlyCredits: 100 });
    expect(e.periodStart).toEqual(new Date('2026-10-10T00:00:00Z'));
    expect(e.periodEnd).toEqual(new Date('2026-11-10T00:00:00Z'));
  });

  it('ends the credit period with the subscription', () => {
    const end = new Date('2026-10-30T00:00:00Z');
    expect(resolveEntitlements(inputs({ subscription: onTutorPro(end) })).periodEnd).toEqual(end);
  });

  it('answers with no features when the free plan is missing', () => {
    const e = resolveEntitlements(inputs({ freePlan: null }));
    expect(e.plan).toBeNull();
    expect(e.features).toEqual({});
  });

  it("adds a grant's credits to an enabled plan key", () => {
    const e = resolveEntitlements(inputs({ subscription: onTutorPro(), grants: [grant('ai.review_draft', '200.5')] }));
    expect(e.features['ai.review_draft']).toEqual({ enabled: true, monthlyCredits: '1200.5', limits: {} });
  });

  it('switches on a key the plan has off, with only the grant credits', () => {
    const e = resolveEntitlements(inputs({ grants: [grant('ai.student_assist', '30')] }));
    expect(e.features['ai.student_assist']).toEqual({ enabled: true, monthlyCredits: '30', limits: {} });
  });

  it('adds a key the plan does not mention at all', () => {
    const e = resolveEntitlements(inputs({ grants: [grant('ai.review_direct', '200')] }));
    expect(e.features['ai.review_direct']).toEqual({ enabled: true, monthlyCredits: '200', limits: {} });
  });

  it('makes the key unmetered for a grant without credits', () => {
    const e = resolveEntitlements(inputs({ grants: [grant('ai.review_draft', null)] }));
    expect(e.features['ai.review_draft']!.monthlyCredits).toBeNull();
  });

  it('keeps an unmetered plan key unmetered under a credit grant', () => {
    const e = resolveEntitlements(inputs({ subscription: onTutorPro(), grants: [grant('ai.authoring', '100')] }));
    expect(e.features['ai.authoring']).toEqual({ enabled: true, monthlyCredits: null, limits: {} });
  });

  it('sums several grants on one key', () => {
    const e = resolveEntitlements(inputs({ grants: [grant('ai.review_direct', '100'), grant('ai.review_direct', '50')] }));
    expect(e.features['ai.review_direct']!.monthlyCredits).toBe('150');
  });

  it('lets grant limits raise the plan limits, never lower them', () => {
    const e = resolveEntitlements(
      inputs({
        subscription: onTutorPro(),
        grants: [grant('ai.student_assist', '0', { limits: { perLearnerMonthlyCredits: 20 } })],
      }),
    );
    expect(e.features['ai.student_assist']!.limits).toEqual({ perLearnerMonthlyCredits: 100 });
    const raised = resolveEntitlements(
      inputs({
        subscription: onTutorPro(),
        grants: [grant('ai.student_assist', '0', { limits: { perLearnerMonthlyCredits: 250 } })],
      }),
    );
    expect(raised.features['ai.student_assist']!.limits).toEqual({ perLearnerMonthlyCredits: 250 });
  });

  it('ignores scheduled, ended and revoked grants', () => {
    const e = resolveEntitlements(
      inputs({
        grants: [
          grant('ai.review_direct', '10', { startsAt: new Date(NOW.getTime() + DAY) }),
          grant('ai.review_direct', '10', { endsAt: NOW }),
          grant('ai.review_direct', '10', { revokedAt: new Date(NOW.getTime() - 1) }),
        ],
      }),
    );
    expect(e.features['ai.review_direct']).toBeUndefined();
    expect(e.grants).toEqual([]);
  });

  it('lists the grants counting now, soonest to end first', () => {
    const later = new Date(NOW.getTime() + 30 * DAY);
    const sooner = new Date(NOW.getTime() + 5 * DAY);
    const e = resolveEntitlements(
      inputs({
        grants: [
          grant('ai.review_direct', '10', { endsAt: later }),
          grant('ai.student_assist', null, { endsAt: sooner }),
          grant('ai.practice', '5', { startsAt: new Date(NOW.getTime() + DAY) }),
        ],
      }),
    );
    expect(e.grants).toEqual([
      { featureKey: 'ai.student_assist', endsAt: sooner },
      { featureKey: 'ai.review_direct', endsAt: later },
    ]);
  });

  it('does not let a grant mutate the plan it was resolved from', () => {
    resolveEntitlements(inputs({ subscription: onTutorPro(), grants: [grant('ai.student_assist', '1', { limits: { perLearnerMonthlyCredits: 500 } })] }));
    expect(TUTOR_PRO.features[1]!.limits).toEqual({ perLearnerMonthlyCredits: 100 });
  });

  describe('validUntil', () => {
    it('is the end of the credit period when nothing else changes sooner', () => {
      expect(resolveEntitlements(inputs()).validUntil).toEqual(new Date('2026-11-01T00:00:00Z'));
      expect(resolveEntitlements(inputs({ subscription: onTutorPro() })).validUntil).toEqual(new Date('2026-11-10T00:00:00Z'));
    });

    it('is the start of a scheduled grant or the end of an active one, whichever comes first', () => {
      const starts = new Date(NOW.getTime() + 3 * DAY);
      const ends = new Date(NOW.getTime() + 5 * DAY);
      expect(
        resolveEntitlements(inputs({ grants: [grant('ai.review_direct', '1', { startsAt: starts, endsAt: new Date(NOW.getTime() + 60 * DAY) }), grant('ai.practice', '1', { endsAt: ends })] }))
          .validUntil,
      ).toEqual(starts);
    });

    it('ignores revoked grants and moments already past', () => {
      const e = resolveEntitlements(
        inputs({
          grants: [
            grant('ai.review_direct', '1', { endsAt: new Date(NOW.getTime() + DAY), revokedAt: new Date(NOW.getTime() - 1) }),
            grant('ai.practice', '1', { endsAt: NOW }),
          ],
        }),
      );
      expect(e.validUntil).toEqual(new Date('2026-11-01T00:00:00Z'));
    });

    it('is the end of a subscription cut short inside its cycle', () => {
      const end = new Date('2026-10-25T00:00:00Z');
      expect(resolveEntitlements(inputs({ subscription: onTutorPro(end) })).validUntil).toEqual(end);
    });
  });

  describe('a grant switching a key off (plan 90, phase 3)', () => {
    const off = (featureKey: string, over: Partial<EntitlementInputs['grants'][number]> = {}) =>
      grant(featureKey, null, { enabled: false, ...over });

    it('switches off a key the plan carries, credits and limits gone', () => {
      const e = resolveEntitlements(inputs({ subscription: onTutorPro(), grants: [off('ai.student_assist')] }));
      expect(e.features['ai.student_assist']).toEqual({ enabled: false, monthlyCredits: null, limits: {} });
      expect(e.features['ai.review_draft']).toEqual({ enabled: true, monthlyCredits: '1000', limits: {} });
    });

    it('wins over a grant switching the same key on, in either order', () => {
      for (const grants of [
        [grant('ai.review_direct', '50'), off('ai.review_direct')],
        [off('ai.review_direct'), grant('ai.review_direct', '50')],
      ]) {
        expect(resolveEntitlements(inputs({ grants })).features['ai.review_direct']).toEqual({
          enabled: false,
          monthlyCredits: null,
          limits: {},
        });
      }
    });

    it('is not listed among the grants that give a key', () => {
      const e = resolveEntitlements(inputs({ grants: [off('ai.review_draft'), grant('ai.practice', '5')] }));
      expect(e.grants.map((g) => g.featureKey)).toEqual(['ai.practice']);
    });

    it('counts only while active: scheduled, revoked or ended leave the plan alone', () => {
      for (const over of [
        { startsAt: new Date(NOW.getTime() + DAY) },
        { revokedAt: new Date(NOW.getTime() - 1) },
        { endsAt: NOW },
      ]) {
        const e = resolveEntitlements(inputs({ grants: [off('ai.review_draft', over)] }));
        expect(e.features['ai.review_draft']).toEqual({ enabled: true, monthlyCredits: '50', limits: {} });
      }
    });

    it('moves validUntil to its end, when the plan comes back', () => {
      const ends = new Date(NOW.getTime() + 2 * DAY);
      expect(resolveEntitlements(inputs({ grants: [off('ai.review_draft', { endsAt: ends })] })).validUntil).toEqual(ends);
    });
  });

  describe('student seats (plan 90, phase 4)', () => {
    const SCHOOL: ResolvablePlan = { code: 'school', name: 'School', version: 2, features: [f('seats.students', true, null, { max: 100 })] };
    const onSchool = (): EntitlementInputs['subscription'] => ({
      id: 'sub-2',
      status: 'active',
      periodStart: new Date('2026-09-10T00:00:00Z'),
      periodEnd: null,
      plan: SCHOOL,
    });
    const seats = (max: number, over: Partial<EntitlementInputs['grants'][number]> = {}) =>
      grant('seats.students', null, { limits: { max }, ...over });

    it("reads the plan's max", () => {
      expect(studentSeatLimit(resolveEntitlements(inputs({ subscription: onSchool() })).features)).toBe(100);
    });

    it('has no limit when the plan does not mention the key', () => {
      expect(studentSeatLimit(resolveEntitlements(inputs()).features)).toBeNull();
    });

    it('lets a grant raise the max, never lower it', () => {
      const raised = resolveEntitlements(inputs({ subscription: onSchool(), grants: [seats(150)] }));
      expect(studentSeatLimit(raised.features)).toBe(150);
      const lowered = resolveEntitlements(inputs({ subscription: onSchool(), grants: [seats(10)] }));
      expect(studentSeatLimit(lowered.features)).toBe(100);
    });

    it('ignores a seats grant on a plan without a limit (no limit is more than any max)', () => {
      const e = resolveEntitlements(inputs({ grants: [seats(20)] }));
      expect(e.features['seats.students']).toBeUndefined();
      expect(studentSeatLimit(e.features)).toBeNull();
      expect(e.grants).toEqual([]);
    });
  });
});
