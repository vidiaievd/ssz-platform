import type { Enrollment } from '../../domain/entities/enrollment.entity.js';

export interface EnrollmentDto {
  id: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  unenrolledAt: string | null;
  unenrollReason: string | null;
}

export function toEnrollmentDto(enrollment: Enrollment): EnrollmentDto {
  return {
    id: enrollment.id,
    userId: enrollment.userId,
    containerId: enrollment.containerId,
    schoolId: enrollment.schoolId,
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt.toISOString(),
    completedAt: enrollment.completedAt?.toISOString() ?? null,
    unenrolledAt: enrollment.unenrolledAt?.toISOString() ?? null,
    unenrollReason: enrollment.unenrollReason,
  };
}
