export interface TutoringStudentProps {
  id: string;
  tutorGroupId: string;
  userId: string;
  joinedAt: Date;
}

export class TutoringStudent {
  private readonly _id: string;
  private readonly _tutorGroupId: string;
  private readonly _userId: string;
  private readonly _joinedAt: Date;

  private constructor(props: TutoringStudentProps) {
    this._id = props.id;
    this._tutorGroupId = props.tutorGroupId;
    this._userId = props.userId;
    this._joinedAt = props.joinedAt;
  }

  static create(props: TutoringStudentProps): TutoringStudent {
    return new TutoringStudent(props);
  }

  static rehydrate(props: TutoringStudentProps): TutoringStudent {
    return new TutoringStudent(props);
  }

  get id(): string { return this._id; }
  get tutorGroupId(): string { return this._tutorGroupId; }
  get userId(): string { return this._userId; }
  get joinedAt(): Date { return this._joinedAt; }
}
