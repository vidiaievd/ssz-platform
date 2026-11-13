import { adminMemberRole } from './admin-school-roster.js';

describe('the admin roster role', () => {
  it('keeps students and teachers apart and puts everyone else under staff', () => {
    expect(adminMemberRole('STUDENT')).toBe('student');
    expect(adminMemberRole('TEACHER')).toBe('teacher');
    for (const role of ['OWNER', 'ADMIN', 'MANAGER', 'CONTENT_ADMIN', 'SCHEDULER'] as const) {
      expect(adminMemberRole(role)).toBe('staff');
    }
  });
});
