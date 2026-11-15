import { diffPlanFeatures } from './plan-diff.js';
import type { PlanFeature } from './plan.js';

const f = (featureKey: string, monthlyCredits: string | null = null, limits: Record<string, number> = {}, enabled = true): PlanFeature => ({
  featureKey,
  enabled,
  monthlyCredits,
  limits,
});

describe('diffPlanFeatures', () => {
  it('same terms on both sides → nothing; credits compare as numbers', () => {
    expect(diffPlanFeatures([f('ai.practice', '300')], [f('ai.practice', '300.000000')])).toEqual([]);
  });

  it('added, removed and changed, ordered by key', () => {
    const changes = diffPlanFeatures(
      [f('seats.students', null, { max: 30 }), f('ai.review_draft', '300'), f('school.review_ai_policy')],
      [f('seats.students', null, { max: 20 }), f('ai.review_draft', '500'), f('ai.authoring', '100')],
    );
    expect(changes.map((c) => [c.featureKey, c.change])).toEqual([
      ['ai.authoring', 'added'],
      ['ai.review_draft', 'changed'],
      ['school.review_ai_policy', 'removed'],
      ['seats.students', 'changed'],
    ]);
    expect(changes[0]).toMatchObject({ before: null, after: { monthlyCredits: '100' } });
    expect(changes[2]).toMatchObject({ before: { enabled: true }, after: null });
    expect(changes[3]).toMatchObject({ before: { limits: { max: 30 } }, after: { limits: { max: 20 } } });
  });

  it('switching a key off, unmetering it, or dropping a limit is a change', () => {
    expect(diffPlanFeatures([f('ai.practice', '10')], [f('ai.practice', '10', {}, false)])).toHaveLength(1);
    expect(diffPlanFeatures([f('ai.practice', '10')], [f('ai.practice', null)])).toHaveLength(1);
    expect(diffPlanFeatures([f('ai.practice', '10', { perLearnerMonthlyCredits: 5 })], [f('ai.practice', '10')])).toHaveLength(1);
  });
});
