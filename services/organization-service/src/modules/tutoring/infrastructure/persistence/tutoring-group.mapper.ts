import { TutoringGroup } from '../../domain/entities/tutoring-group.entity.js';
import { TutoringStudent } from '../../domain/entities/tutoring-student.entity.js';

type PrismaTutoringStudent = {
  id: string;
  tutorGroupId: string;
  userId: string;
  joinedAt: Date;
};

type PrismaTutoringGroup = {
  id: string;
  tutorId: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  students: PrismaTutoringStudent[];
};

export class TutoringGroupMapper {
  static toDomain(raw: PrismaTutoringGroup): TutoringGroup {
    const students = raw.students.map((s) =>
      TutoringStudent.rehydrate({
        id: s.id,
        tutorGroupId: s.tutorGroupId,
        userId: s.userId,
        joinedAt: s.joinedAt,
      }),
    );

    return TutoringGroup.rehydrate({
      id: raw.id,
      tutorId: raw.tutorId,
      name: raw.name ?? undefined,
      description: raw.description ?? undefined,
      avatarUrl: raw.avatarUrl ?? undefined,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt ?? undefined,
      students,
    });
  }
}
