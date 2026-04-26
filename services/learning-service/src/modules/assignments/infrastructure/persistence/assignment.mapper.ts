import { Assignment } from '../../domain/entities/assignment.entity.js';
import { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';
import type { AssignmentStatus } from '../../domain/entities/assignment.entity.js';

type PrismaAssignmentModel = {
  id: string;
  assignerId: string;
  assigneeId: string;
  schoolId: string | null;
  contentType: string;
  contentId: string;
  status: string;
  assignedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  notes: string | null;
  deletedAt: Date | null;
};

export class AssignmentMapper {
  static toDomain(row: PrismaAssignmentModel): Assignment {
    const contentRef = ContentRef.fromPersistence(row.contentType, row.contentId);
    return Assignment.reconstitute({
      id: row.id,
      assignerId: row.assignerId,
      assigneeId: row.assigneeId,
      schoolId: row.schoolId,
      contentRef,
      status: row.status as AssignmentStatus,
      assignedAt: row.assignedAt,
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      cancelledReason: row.cancelledReason,
      notes: row.notes,
      deletedAt: row.deletedAt,
    });
  }

  static toPersistence(assignment: Assignment) {
    return {
      id: assignment.id,
      assignerId: assignment.assignerId,
      assigneeId: assignment.assigneeId,
      schoolId: assignment.schoolId,
      contentType: assignment.contentRef.type,
      contentId: assignment.contentRef.id,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      dueAt: assignment.dueAt,
      completedAt: assignment.completedAt,
      cancelledAt: assignment.cancelledAt,
      cancelledReason: assignment.cancelledReason,
      notes: assignment.notes,
      deletedAt: assignment.deletedAt,
    };
  }
}
