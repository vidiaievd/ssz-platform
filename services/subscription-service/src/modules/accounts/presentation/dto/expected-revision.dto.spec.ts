import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssignPlanDto, CancelSubscriptionQueryDto, RevokeGrantDto } from './account.dto.js';

function check<T extends object>(cls: new () => T, plain: object): { value: T; errors: string[] } {
  const value = plainToInstance(cls, plain);
  return { value, errors: validateSync(value).flatMap((e) => Object.keys(e.constraints ?? {})) };
}

describe('expectedRevision in admin account DTOs', () => {
  it('is optional', () => {
    expect(check(AssignPlanDto, { planCode: 'school', reason: 'r' }).errors).toEqual([]);
    expect(check(RevokeGrantDto, { reason: 'r' }).errors).toEqual([]);
    expect(check(CancelSubscriptionQueryDto, { reason: 'r' }).value.expectedRevision).toBeUndefined();
  });

  it('comes from the query string as a number (DELETE ?expectedRevision=4)', () => {
    const { value, errors } = check(CancelSubscriptionQueryDto, { reason: 'r', expectedRevision: '4' });
    expect(errors).toEqual([]);
    expect(value.expectedRevision).toBe(4);
  });

  it('accepts 0 — a payer the GET answered 404 for', () => {
    expect(check(RevokeGrantDto, { reason: 'r', expectedRevision: 0 }).errors).toEqual([]);
  });

  it.each([[-1], [1.5], ['abc']])('refuses %p', (bad) => {
    expect(check(AssignPlanDto, { planCode: 'school', reason: 'r', expectedRevision: bad }).errors.length).toBeGreaterThan(0);
  });
});
