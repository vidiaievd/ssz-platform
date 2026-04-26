import type { Assignment } from '../../domain/entities/assignment.entity.js';

export interface AssignmentDto {
  id: string;
  assignerId: string;
  assigneeId: string;
  schoolId: string | null;
  contentRef: { type: string; id: string };
  status: string;
  assignedAt: string;
  dueAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  notes: string | null;
}

export function toAssignmentDto(assignment: Assignment): AssignmentDto {
  return {
    id: assignment.id,
    assignerId: assignment.assignerId,
    assigneeId: assignment.assigneeId,
    schoolId: assignment.schoolId,
    contentRef: { type: assignment.contentRef.type, id: assignment.contentRef.id },
    status: assignment.status,
    assignedAt: assignment.assignedAt.toISOString(),
    dueAt: assignment.dueAt.toISOString(),
    completedAt: assignment.completedAt?.toISOString() ?? null,
    cancelledAt: assignment.cancelledAt?.toISOString() ?? null,
    cancelledReason: assignment.cancelledReason,
    notes: assignment.notes,
  };
}
