import { schoolStatus } from './admin-school.js';

describe('schoolStatus', () => {
  it('reads a soft-deleted row as deleted, whatever its active flag says', () => {
    expect(schoolStatus(true, new Date())).toBe('deleted');
    expect(schoolStatus(false, new Date())).toBe('deleted');
  });

  it('tells an active row from one switched off', () => {
    expect(schoolStatus(true, null)).toBe('active');
    expect(schoolStatus(false, null)).toBe('inactive');
  });
});
