import type { FeatureKeyDefinition } from './feature-key.js';
import { Plan, validatePlanFeatures, type PlanFeature } from './plan.js';

const now = new Date('2026-10-21T10:00:00.000Z');

const feature = (featureKey: string, over: Partial<PlanFeature> = {}): PlanFeature => ({
  featureKey,
  enabled: true,
  monthlyCredits: '100',
  limits: {},
  ...over,
});

const createPlan = (features: PlanFeature[] = [feature('ai.review_draft')]) =>
  Plan.create({ id: 'p1', code: 'tutor_pro', name: 'Tutor Pro', audience: 'workspace', features, createdBy: 'admin', now });

describe('Plan', () => {
  it('starts active at version 1', () => {
    const plan = createPlan().value;
    expect(plan.status).toBe('active');
    expect(plan.current.version).toBe(1);
    expect(plan.current.features).toEqual([feature('ai.review_draft')]);
  });

  it('refuses a code that is not lower_snake_case', () => {
    const r = Plan.create({ id: 'p1', code: 'Tutor-Pro', name: 'x', audience: 'workspace', features: [], createdBy: 'a', now });
    expect(r.error).toEqual({ code: 'invalid_plan_code', value: 'Tutor-Pro' });
  });

  it('refuses an unknown feature key', () => {
    expect(createPlan([feature('ai.telepathy')]).error).toEqual({ code: 'unknown_feature_key', featureKey: 'ai.telepathy' });
  });

  it('a revision is a new version and keeps the old one intact', () => {
    const plan = createPlan().value;
    const v1 = plan.current;
    const v2 = plan.revise([feature('ai.review_draft', { monthlyCredits: '250' })], 'admin2', now).value;
    expect(v2.version).toBe(2);
    expect(plan.current).toBe(v2);
    expect(v1.features[0]!.monthlyCredits).toBe('100');
  });

  it('a rejected revision leaves the current version as it was', () => {
    const plan = createPlan().value;
    expect(plan.revise([feature('ai.nope')], 'admin', now).isFail).toBe(true);
    expect(plan.current.version).toBe(1);
  });

  it('an archived plan is not assignable and cannot be revised', () => {
    const plan = createPlan().value;
    expect(plan.versionForAssignment().value.version).toBe(1);
    expect(plan.archive().isOk).toBe(true);
    expect(plan.versionForAssignment().error).toEqual({ code: 'plan_archived', planCode: 'tutor_pro' });
    expect(plan.revise([], 'admin', now).error).toEqual({ code: 'plan_archived', planCode: 'tutor_pro' });
    expect(plan.archive().error).toEqual({ code: 'plan_already_archived', planCode: 'tutor_pro' });
  });

  it('renaming does not create a version', () => {
    const plan = createPlan().value;
    plan.rename('Tutor Pro (2026)');
    expect(plan.name).toBe('Tutor Pro (2026)');
    expect(plan.current.version).toBe(1);
  });
});

describe('validatePlanFeatures', () => {
  it('refuses the same key twice', () => {
    const r = validatePlanFeatures([feature('ai.practice'), feature('ai.practice')]);
    expect(r.error).toEqual({ code: 'duplicate_feature_key', featureKey: 'ai.practice' });
  });

  it.each(['-1', '1e3', '1.1234567', 'abc', ''])('refuses credits "%s"', (value) => {
    const r = validatePlanFeatures([feature('ai.practice', { monthlyCredits: value })]);
    expect(r.error).toEqual({ code: 'invalid_credits', featureKey: 'ai.practice', value });
  });

  it('accepts unmetered and fractional credits', () => {
    const r = validatePlanFeatures([
      feature('ai.practice', { monthlyCredits: null }),
      feature('ai.authoring', { monthlyCredits: '0.5' }),
    ]);
    expect(r.isOk).toBe(true);
  });

  it('accepts only the limits the key understands', () => {
    expect(validatePlanFeatures([feature('ai.student_assist', { limits: { perLearnerMonthlyCredits: 20 } })]).isOk).toBe(true);
    expect(validatePlanFeatures([feature('ai.review_draft', { limits: { perLearnerMonthlyCredits: 20 } })]).error).toEqual({
      code: 'unknown_limit',
      featureKey: 'ai.review_draft',
      limit: 'perLearnerMonthlyCredits',
    });
    expect(validatePlanFeatures([feature('ai.student_assist', { limits: { perLearnerMonthlyCredits: -5 } })]).error).toEqual({
      code: 'invalid_limit',
      featureKey: 'ai.student_assist',
      limit: 'perLearnerMonthlyCredits',
    });
  });

  it('refuses credits on a key that is not metered in credits', () => {
    const catalog: FeatureKeyDefinition[] = [{ key: 'scheduling', limitKind: 'switch', limitNames: ['seats'] }];
    const lookup = (k: string) => catalog.find((d) => d.key === k);
    expect(validatePlanFeatures([feature('scheduling', { monthlyCredits: null, limits: { seats: 5 } })], lookup).isOk).toBe(true);
    expect(validatePlanFeatures([feature('scheduling')], lookup).error).toEqual({
      code: 'credits_not_applicable',
      featureKey: 'scheduling',
    });
  });
});
