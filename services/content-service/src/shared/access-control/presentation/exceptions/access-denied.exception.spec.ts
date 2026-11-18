import { AccessDeniedException } from './access-denied.exception.js';

describe('AccessDeniedException', () => {
  it('is a 403 ACCESS_DENIED by default', () => {
    const err = new AccessDeniedException('not_owner');
    expect(err.getStatus()).toBe(403);
    expect(err.getResponse()).toMatchObject({ code: 'ACCESS_DENIED', reason: 'not_owner' });
  });

  it('is a 409 SCHOOL_NOT_ACTIVE when the school is read only', () => {
    const err = new AccessDeniedException('school_not_active');
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'SCHOOL_NOT_ACTIVE' });
  });
});
