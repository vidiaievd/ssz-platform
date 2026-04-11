import type { MemberRole } from '../value-objects/member-role.vo.js';

export interface SchoolMemberProps {
  id: string;
  schoolId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

export class SchoolMember {
  private readonly _id: string;
  private readonly _schoolId: string;
  private readonly _userId: string;
  private _role: MemberRole;
  private readonly _joinedAt: Date;

  private constructor(props: SchoolMemberProps) {
    this._id = props.id;
    this._schoolId = props.schoolId;
    this._userId = props.userId;
    this._role = props.role;
    this._joinedAt = props.joinedAt;
  }

  static create(props: SchoolMemberProps): SchoolMember {
    return new SchoolMember(props);
  }

  static rehydrate(props: SchoolMemberProps): SchoolMember {
    return new SchoolMember(props);
  }

  get id(): string { return this._id; }
  get schoolId(): string { return this._schoolId; }
  get userId(): string { return this._userId; }
  get role(): MemberRole { return this._role; }
  get joinedAt(): Date { return this._joinedAt; }
}
