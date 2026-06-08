export type AbsenceKind = 'sick' | 'leave' | 'vacancy';
export type AbsenceScope = 'today' | 'window' | 'permanent';

export class TeacherAbsence {
  constructor(
    public readonly id: string,
    public readonly schoolId: string,
    public readonly teacherId: string,
    public readonly kind: AbsenceKind,
    public readonly scope: AbsenceScope,
    public readonly fromDate: Date,
    public readonly toDate: Date | null,
    public readonly reason: string,
    public readonly createdBy: string,
    public readonly createdAt: Date,
  ) {}
}
