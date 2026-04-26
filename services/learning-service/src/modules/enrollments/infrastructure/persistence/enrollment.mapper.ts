import { Enrollment } from '../../domain/entities/enrollment.entity.js';
import type { EnrollmentStatus } from '../../domain/entities/enrollment.entity.js';

type PrismaEnrollmentModel = {
  id: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  status: string;
  enrolledAt: Date;
  completedAt: Date | null;
  unenrolledAt: Date | null;
  unenrollReason: string | null;
  deletedAt: Date | null;
};

export class EnrollmentMapper {
  static toDomain(row: PrismaEnrollmentModel): Enrollment {
    return Enrollment.reconstitute({
      id: row.id,
      userId: row.userId,
      containerId: row.containerId,
      schoolId: row.schoolId,
      status: row.status as EnrollmentStatus,
      enrolledAt: row.enrolledAt,
      completedAt: row.completedAt,
      unenrolledAt: row.unenrolledAt,
      unenrollReason: row.unenrollReason,
      deletedAt: row.deletedAt,
    });
  }

  static toPersistence(enrollment: Enrollment) {
    return {
      id: enrollment.id,
      userId: enrollment.userId,
      containerId: enrollment.containerId,
      schoolId: enrollment.schoolId,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      unenrolledAt: enrollment.unenrolledAt,
      unenrollReason: enrollment.unenrollReason,
      deletedAt: enrollment.deletedAt,
    };
  }
}
