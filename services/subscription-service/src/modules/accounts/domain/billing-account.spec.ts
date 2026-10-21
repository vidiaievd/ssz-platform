import { Plan, type PlanAudience } from '../../plans/domain/plan.js';
import { BillingAccount } from './billing-account.js';
import type { Subscription } from './subscription.js';

const now = new Date('2026-10-21T10:00:00.000Z');
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

const plan = (code: string, audience: PlanAudience = 'workspace') =>
  Plan.create({ id: `plan-${code}`, code, name: code, audience, features: [], createdBy: 'seed', now }).value;

const account = (openSubscriptions: Subscription[] = []) =>
  BillingAccount.restore({ id: 'acc', type: 'workspace', externalId: 'school-1', createdAt: now, revision: 3, openSubscriptions });

const running = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'old',
  accountId: 'acc',
  planId: 'plan-free_workspace',
  planCode: 'free_workspace',
  planVersion: 1,
  status: 'active',
  periodStart: later(-30),
  periodEnd: null,
  createdBy: 'seed',
  createdAt: later(-30),
  endedAt: null,
  endedBy: null,
  ...over,
});

const assign = (acc: BillingAccount, p: Plan, over: { status?: 'trial' | 'active'; periodEnd?: Date | null } = {}) =>
  acc.assignPlan(p, { subscriptionId: 'new', status: over.status ?? 'active', periodEnd: over.periodEnd ?? null, by: 'admin', now });

describe('BillingAccount', () => {
  it('assigning puts the account on the plan current version', () => {
    const acc = account();
    const tutorPro = plan('tutor_pro');
    tutorPro.revise([], 'admin', now);
    const s = assign(acc, tutorPro).value;
    expect(s).toMatchObject({ planCode: 'tutor_pro', planVersion: 2, status: 'active', periodStart: now, periodEnd: null });
    expect(acc.current(now)).toBe(s);
    expect(acc.changedSubscriptions()).toEqual([s]);
  });

  it('assigning closes the running subscription as canceled', () => {
    const acc = account([running()]);
    assign(acc, plan('tutor_pro'));
    const [closed, started] = acc.changedSubscriptions();
    expect(closed).toMatchObject({ id: 'old', status: 'canceled', endedAt: now, endedBy: 'admin' });
    expect(started).toMatchObject({ id: 'new', status: 'active' });
  });

  it('a running row whose period already passed is closed as expired at its end', () => {
    const acc = account([running({ status: 'trial', periodEnd: later(-1) })]);
    expect(acc.current(now)).toBeNull();
    assign(acc, plan('tutor_pro'));
    expect(acc.changedSubscriptions()[0]).toMatchObject({ id: 'old', status: 'expired', endedAt: later(-1) });
  });

  it('refuses a plan for the other audience', () => {
    expect(assign(account(), plan('student_plus', 'individual')).error).toEqual({
      code: 'audience_mismatch',
      planCode: 'student_plus',
      audience: 'individual',
      accountType: 'workspace',
    });
  });

  it('refuses an archived plan and leaves the running subscription alone', () => {
    const acc = account([running()]);
    const old = plan('old_school');
    old.archive();
    expect(assign(acc, old).error).toEqual({ code: 'plan_archived', planCode: 'old_school' });
    expect(acc.changedSubscriptions()).toEqual([]);
    expect(acc.current(now)?.id).toBe('old');
  });

  it('a trial needs an end, and no end may be in the past', () => {
    expect(assign(account(), plan('tutor_pro'), { status: 'trial' }).error).toEqual({ code: 'trial_needs_period_end' });
    expect(assign(account(), plan('tutor_pro'), { periodEnd: now }).error).toEqual({ code: 'period_end_in_past' });
    expect(assign(account(), plan('tutor_pro'), { status: 'trial', periodEnd: later(14) }).value.status).toBe('trial');
  });

  it('cancel ends the current subscription; nothing to cancel is an error', () => {
    const acc = account([running()]);
    expect(acc.cancelSubscription('admin', now).value).toMatchObject({ id: 'old', status: 'canceled', endedAt: now });
    expect(acc.current(now)).toBeNull();
    expect(acc.cancelSubscription('admin', now).error).toEqual({ code: 'no_current_subscription' });
  });
});
