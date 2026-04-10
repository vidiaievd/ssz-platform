import { InvitationStatus } from '../value-objects/invitation-status.vo.js';
import type { MemberRole } from '../value-objects/member-role.vo.js';

export interface SchoolInvitationProps {
  id: string;
  schoolId: string;
  email: string;
  role: MemberRole;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class SchoolInvitation {
  private readonly _id: string;
  private readonly _schoolId: string;
  private readonly _email: string;
  private readonly _role: MemberRole;
  private readonly _token: string;
  private _status: InvitationStatus;
  private readonly _expiresAt: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: SchoolInvitationProps) {
    this._id = props.id;
    this._schoolId = props.schoolId;
    this._email = props.email;
    this._role = props.role;
    this._token = props.token;
    this._status = props.status;
    this._expiresAt = props.expiresAt;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(props: SchoolInvitationProps): SchoolInvitation {
    return new SchoolInvitation(props);
  }

  static rehydrate(props: SchoolInvitationProps): SchoolInvitation {
    return new SchoolInvitation(props);
  }

  isExpired(): boolean {
    return this._expiresAt < new Date();
  }

  isPending(): boolean {
    return this._status === InvitationStatus.PENDING;
  }

  accept(): void {
    this._status = InvitationStatus.ACCEPTED;
    this._updatedAt = new Date();
  }

  cancel(): void {
    this._status = InvitationStatus.CANCELLED;
    this._updatedAt = new Date();
  }

  expire(): void {
    this._status = InvitationStatus.EXPIRED;
    this._updatedAt = new Date();
  }

  get id(): string { return this._id; }
  get schoolId(): string { return this._schoolId; }
  get email(): string { return this._email; }
  get role(): MemberRole { return this._role; }
  get token(): string { return this._token; }
  get status(): InvitationStatus { return this._status; }
  get expiresAt(): Date { return this._expiresAt; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
}
