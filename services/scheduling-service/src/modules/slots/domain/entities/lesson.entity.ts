export type LessonStatus = 'scheduled' | 'moved' | 'cancelled' | 'held';

export class Lesson {
  constructor(
    public readonly id: string,
    public readonly groupId: string,
    public readonly schoolId: string,
    public readonly slotId: string | null,
    public readonly date: Date,
    public readonly startTime: string,
    public readonly endTime: string,
    public readonly teacherId: string,
    public readonly room: string | null,
    public readonly status: LessonStatus,
    public readonly curriculumUnitId: string | null,
  ) {}
}
