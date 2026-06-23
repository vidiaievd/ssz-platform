import type { MemberRole } from '../value-objects/member-role.vo.js';

export interface SchoolMemberProps {
  id: string;
  schoolId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  // Denormalized snapshot from user-profile-service at creation time — kept in
  // sync afterwards via profile.created/profile.updated events, not re-read here.
  name?: string | null;
  avatarUrl?: string | null;
}

export class SchoolMember {
  private readonly _id: string;
  private readonly _schoolId: string;
  private readonly _userId: string;
  private _role: MemberRole;
  private readonly _joinedAt: Date;
  private readonly _name: string | null;
  private readonly _avatarUrl: string | null;

  private constructor(props: SchoolMemberProps) {
    this._id = props.id;
    this._schoolId = props.schoolId;
    this._userId = props.userId;
    this._role = props.role;
    this._joinedAt = props.joinedAt;
    this._name = props.name ?? null;
    this._avatarUrl = props.avatarUrl ?? null;
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
  get name(): string | null { return this._name; }
  get avatarUrl(): string | null { return this._avatarUrl; }
}
