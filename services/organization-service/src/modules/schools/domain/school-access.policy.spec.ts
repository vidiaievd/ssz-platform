import { School } from './entities/school.entity.js';
import { SchoolType } from './value-objects/school-type.vo.js';
import { SchoolNotActiveException } from './exceptions/school-not-active.exception.js';
import {
  assertSchoolWritable,
  schoolHoldsRoles,
  schoolReadableBy,
  type SchoolStatus,
} from './school-access.policy.js';

const STATUSES: SchoolStatus[] = ['active', 'suspended', 'closed', 'purged'];

function schoolIn(status: SchoolStatus, over: { deletedAt?: Date } = {}): School {
  const now = new Date('2026-11-10T00:00:00Z');
  return School.rehydrate({
    id: 's-1',
    name: 'Nordick',
    slug: 'nordick',
    ownerId: 'owner-1',
    type: SchoolType.ONLINE,
    isActive: status === 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: over.deletedAt,
    members: [],
    requireTutorReviewForSelfPaced: false,
    lifecycle: { status, closesAt: null, purgeAt: null },
  });
}

describe('school access by lifecycle status (plan 90, phase 5, step 3)', () => {
  it('lets only an active school change', () => {
    expect(() => assertSchoolWritable('s-1', 'active')).not.toThrow();
    for (const status of STATUSES.filter((s) => s !== 'active')) {
      try {
        assertSchoolWritable('s-1', status);
        throw new Error(`${status} was writable`);
      } catch (err) {
        expect(err).toBeInstanceOf(SchoolNotActiveException);
        expect((err as SchoolNotActiveException).status).toBe(status);
      }
    }
  });

  it('keeps roles while active or suspended, none in an archive or a tombstone', () => {
    expect(STATUSES.filter(schoolHoldsRoles)).toEqual(['active', 'suspended']);
  });

  it('shows a closed school to its owner alone, a purged one to nobody', () => {
    expect(schoolReadableBy('suspended', { isOwner: false })).toBe(true);
    expect(schoolReadableBy('closed', { isOwner: true })).toBe(true);
    expect(schoolReadableBy('closed', { isOwner: false })).toBe(false);
    expect(schoolReadableBy('purged', { isOwner: true })).toBe(false);
  });

  describe('School aggregate', () => {
    it('refuses changes through assertWritable unless active', () => {
      expect(() => schoolIn('active').assertWritable()).not.toThrow();
      expect(() => schoolIn('suspended').assertWritable()).toThrow(SchoolNotActiveException);
    });

    it('reads the status it was given, and from the mirror on a narrower read', () => {
      expect(schoolIn('suspended').status).toBe('suspended');
      const narrow = School.rehydrate({
        ...{ id: 's-1', name: 'N', slug: 'n', ownerId: 'o', type: SchoolType.ONLINE, isActive: false },
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        members: [],
        requireTutorReviewForSelfPaced: false,
      });
      expect(narrow.status).toBe('closed');
    });

    it('a new school is active', () => {
      const school = School.create({ id: 's-2', name: 'New', slug: 'new', ownerId: 'o' }, 'evt');
      expect(school.status).toBe('active');
      expect(school.closesAt).toBeNull();
      expect(school.purgeAt).toBeNull();
    });

    it('is readable by the owner of a closed school only', () => {
      const closed = schoolIn('closed');
      expect(closed.isReadableBy('owner-1')).toBe(true);
      expect(closed.isReadableBy('teacher-1')).toBe(false);
    });
  });
});
