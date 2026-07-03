import type { CanDoProgressEntity } from '../entities/can-do-progress.entity.js';

export const CAN_DO_PROGRESS_REPOSITORY = Symbol('ICanDoProgressRepository');

export interface ICanDoProgressRepository {
  findByUserAndDescriptor(userId: string, descriptorId: string): Promise<CanDoProgressEntity | null>;
  findByUserAndCourse(userId: string, courseContainerId: string): Promise<CanDoProgressEntity[]>;
  findByUserId(userId: string): Promise<CanDoProgressEntity[]>;
  upsert(entity: CanDoProgressEntity): Promise<void>;
}
