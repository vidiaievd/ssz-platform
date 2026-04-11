import type { StudentProfile } from '../entities/student-profile.entity.js';

export interface IStudentProfileRepository {
  findByProfileId(profileId: string): Promise<StudentProfile | null>;
  save(studentProfile: StudentProfile): Promise<void>;
}

export const STUDENT_PROFILE_REPOSITORY = Symbol('STUDENT_PROFILE_REPOSITORY');
