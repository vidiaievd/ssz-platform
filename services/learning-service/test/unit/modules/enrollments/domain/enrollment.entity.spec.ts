import { Enrollment } from '../../../../../src/modules/enrollments/domain/entities/enrollment.entity.js';
import {
  EnrollmentAlreadyCompletedError,
  EnrollmentAlreadyUnenrolledError,
  InvalidEnrollmentTransitionError,
} from '../../../../../src/modules/enrollments/domain/exceptions/enrollment.errors.js';

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTAINER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const SCHOOL_ID = 'cccccccc-0000-4000-8000-000000000003';
const NOW = new Date('2026-01-01T12:00:00Z');

const makeEnrollment = () => Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID, schoolId: SCHOOL_ID }, NOW);

describe('Enrollment entity', () => {
  describe('create', () => {
    it('creates with ACTIVE status and raises EnrollmentCreatedEvent', () => {
      const enrollment = makeEnrollment();
      expect(enrollment.status).toBe('ACTIVE');
      expect(enrollment.userId).toBe(USER_ID);
      expect(enrollment.containerId).toBe(CONTAINER_ID);
      expect(enrollment.schoolId).toBe(SCHOOL_ID);
      expect(enrollment.enrolledAt).toEqual(NOW);
      expect(enrollment.completedAt).toBeNull();
      expect(enrollment.getDomainEvents()).toHaveLength(1);
      expect((enrollment.getDomainEvents()[0] as any).eventType).toBe('learning.enrollment.created');
    });

    it('accepts null schoolId', () => {
      const enrollment = Enrollment.create({ userId: USER_ID, containerId: CONTAINER_ID }, NOW);
      expect(enrollment.schoolId).toBeNull();
    });
  });

  describe('complete', () => {
    it('transitions ACTIVE → COMPLETED and raises event', () => {
      const enrollment = makeEnrollment();
      enrollment.clearDomainEvents();
      const completedAt = new Date('2026-03-01T12:00:00Z');

      const result = enrollment.complete(completedAt);

      expect(result.isOk).toBe(true);
      expect(enrollment.status).toBe('COMPLETED');
      expect(enrollment.completedAt).toEqual(completedAt);
      expect(enrollment.getDomainEvents()).toHaveLength(1);
      expect((enrollment.getDomainEvents()[0] as any).eventType).toBe('learning.enrollment.completed');
    });

    it('fails if already COMPLETED', () => {
      const enrollment = makeEnrollment();
      enrollment.complete(NOW);
      enrollment.clearDomainEvents();

      const result = enrollment.complete(NOW);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(EnrollmentAlreadyCompletedError);
    });

    it('fails if UNENROLLED', () => {
      const enrollment = makeEnrollment();
      enrollment.unenroll();
      enrollment.clearDomainEvents();

      const result = enrollment.complete(NOW);

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEnrollmentTransitionError);
    });
  });

  describe('unenroll', () => {
    it('transitions ACTIVE → UNENROLLED and raises event', () => {
      const enrollment = makeEnrollment();
      enrollment.clearDomainEvents();

      const result = enrollment.unenroll('lost interest');

      expect(result.isOk).toBe(true);
      expect(enrollment.status).toBe('UNENROLLED');
      expect(enrollment.unenrollReason).toBe('lost interest');
      expect(enrollment.getDomainEvents()).toHaveLength(1);
      expect((enrollment.getDomainEvents()[0] as any).eventType).toBe('learning.enrollment.unenrolled');
    });

    it('fails if already UNENROLLED', () => {
      const enrollment = makeEnrollment();
      enrollment.unenroll();
      enrollment.clearDomainEvents();

      const result = enrollment.unenroll();

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(EnrollmentAlreadyUnenrolledError);
    });

    it('fails if COMPLETED', () => {
      const enrollment = makeEnrollment();
      enrollment.complete(NOW);
      enrollment.clearDomainEvents();

      const result = enrollment.unenroll();

      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidEnrollmentTransitionError);
    });
  });

  describe('reconstitute', () => {
    it('restores from persistence without raising events', () => {
      const enrollment = Enrollment.reconstitute({
        id: 'eeeeeeee-0000-4000-8000-000000000005',
        userId: USER_ID,
        containerId: CONTAINER_ID,
        schoolId: SCHOOL_ID,
        status: 'ACTIVE',
        enrolledAt: NOW,
        completedAt: null,
        unenrolledAt: null,
        unenrollReason: null,
        deletedAt: null,
      });

      expect(enrollment.id).toBe('eeeeeeee-0000-4000-8000-000000000005');
      expect(enrollment.status).toBe('ACTIVE');
      expect(enrollment.getDomainEvents()).toHaveLength(0);
    });
  });
});
