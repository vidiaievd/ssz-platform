import type { Assignment, AssignmentStatus } from '../entities/assignment.entity.js';
import type { ContentType } from '../../../../shared/domain/value-objects/content-ref.js';

export const ASSIGNMENT_REPOSITORY = Symbol('IAssignmentRepository');

export interface FindByAssigneeOptions {
  status?: AssignmentStatus[];
  limit?: number;
  offset?: number;
}

export interface FindByAssignerOptions {
  status?: AssignmentStatus[];
  assigneeId?: string;
  limit?: number;
  offset?: number;
}

export interface IAssignmentRepository {
  findById(id: string): Promise<Assignment | null>;
  findByAssignee(assigneeId: string, options?: FindByAssigneeOptions): Promise<Assignment[]>;
  findByAssigner(assignerId: string, options?: FindByAssignerOptions): Promise<Assignment[]>;
  // Returns ACTIVE assignments whose dueAt < now — candidates for markOverdue job.
  findOverdueCandidates(now: Date): Promise<Assignment[]>;
  // Returns ACTIVE + OVERDUE assignments referencing the given content item.
  findActiveByContent(contentType: ContentType, contentId: string): Promise<Assignment[]>;
  save(assignment: Assignment): Promise<void>;
  softDelete(id: string): Promise<void>;
}
