export interface TutoringStudentDto {
  id: string;
  userId: string;
  joinedAt: Date;
}

export interface TutoringGroupDto {
  id: string;
  tutorId: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  students: TutoringStudentDto[];
}

export interface TutoringGroupSummaryDto {
  id: string;
  tutorId: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  studentCount: number;
  createdAt: Date;
}
