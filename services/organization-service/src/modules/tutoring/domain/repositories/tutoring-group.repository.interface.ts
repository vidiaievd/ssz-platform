import type { TutoringGroup } from '../entities/tutoring-group.entity.js';

export interface ITutoringGroupRepository {
  findById(id: string): Promise<TutoringGroup | null>;
  findByTutorId(tutorId: string): Promise<TutoringGroup | null>;
  findByStudentId(userId: string): Promise<TutoringGroup | null>;
  save(group: TutoringGroup): Promise<void>;
}

export const TUTORING_GROUP_REPOSITORY = Symbol('TUTORING_GROUP_REPOSITORY');
