import { SchoolMembership } from './school-membership.entity.js';

function makeMembership(): SchoolMembership {
  return SchoolMembership.create({
    id: 'm-1',
    schoolId: 's-1',
    studentId: 'st-1',
    source: 'public-apply',
  });
}

describe('SchoolMembership transitions', () => {
  it('allows onboarding → placement-review', () => {
    const m = makeMembership();
    m.transitionTo('onboarding');
    expect(m.canTransitionTo('placement-review')).toBe(true);
    m.transitionTo('placement-review');
    expect(m.status).toBe('placement-review');
  });

  it('rejects onboarding → active directly, even for auto-place schools', () => {
    const m = makeMembership();
    m.transitionTo('onboarding');
    expect(m.canTransitionTo('active')).toBe(false);
    expect(() => m.transitionTo('active')).toThrow();
  });

  it('allows active only from placement-review', () => {
    const m = makeMembership();
    m.transitionTo('onboarding');
    m.transitionTo('placement-review');
    expect(m.canTransitionTo('active')).toBe(true);
    m.transitionTo('active');
    expect(m.status).toBe('active');
  });
});
