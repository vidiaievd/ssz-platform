import { InvitationStatus } from '../value-objects/invitation-status.vo.js';
import type { MemberRole } from '../value-objects/member-role.vo.js';

export type InvitationKind = 'register' | 'onboard_existing';
export type EmploymentType = 'full' | 'part' | 'contract';

export interface SchoolInvitationProps {
  id: string;
  schoolId: string;
  email: string;
  role: MemberRole;
  kind: InvitationKind;
  targetGroupId?: string | null;
  invitedBy?: string | null;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date | null;
  lastSentAt: Date;
  resendCount: number;
  teacherMaxWeeklyHours?: number | null;
  teacherEmploymentType?: EmploymentType | null;
  capabilities?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class SchoolInvitation {
  private readonly _id: string;
  private readonly _schoolId: string;
  private readonly _email: string;
  private readonly _role: MemberRole;
  private readonly _kind: InvitationKind;
  private readonly _targetGroupId: string | null | undefined;
  private readonly _invitedBy: string | null | undefined;
  private _token: string;
  private _status: InvitationStatus;
  private _expiresAt: Date;
  private _acceptedAt: Date | null | undefined;
  private _lastSentAt: Date;
  private _resendCount: number;
  private readonly _teacherMaxWeeklyHours: number | null | undefined;
  private readonly _teacherEmploymentType: EmploymentType | null | undefined;
  private readonly _capabilities: string[];
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: SchoolInvitationProps) {
    this._id = props.id;
    this._schoolId = props.schoolId;
    this._email = props.email;
    this._role = props.role;
    this._kind = props.kind;
    this._targetGroupId = props.targetGroupId;
    this._invitedBy = props.invitedBy;
    this._token = props.token;
    this._status = props.status;
    this._expiresAt = props.expiresAt;
    this._acceptedAt = props.acceptedAt;
    this._lastSentAt = props.lastSentAt;
    this._resendCount = props.resendCount;
    this._teacherMaxWeeklyHours = props.teacherMaxWeeklyHours ?? null;
    this._teacherEmploymentType = props.teacherEmploymentType ?? null;
    this._capabilities = props.capabilities ?? [];
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

  isAccepted(): boolean {
    return this._status === InvitationStatus.ACCEPTED;
  }

  isRevoked(): boolean {
    return this._status === InvitationStatus.REVOKED;
  }

  accept(): void {
    this._status = InvitationStatus.ACCEPTED;
    this._acceptedAt = new Date();
    this._updatedAt = new Date();
  }

  revoke(): void {
    this._status = InvitationStatus.REVOKED;
    this._updatedAt = new Date();
  }

  expire(): void {
    this._status = InvitationStatus.EXPIRED;
    this._updatedAt = new Date();
  }

  rotateToken(newToken: string, newExpiresAt: Date): void {
    this._token = newToken;
    this._expiresAt = newExpiresAt;
    this._lastSentAt = new Date();
    this._resendCount += 1;
    this._updatedAt = new Date();
  }

  get id(): string { return this._id; }
  get schoolId(): string { return this._schoolId; }
  get email(): string { return this._email; }
  get role(): MemberRole { return this._role; }
  get kind(): InvitationKind { return this._kind; }
  get targetGroupId(): string | null | undefined { return this._targetGroupId; }
  get invitedBy(): string | null | undefined { return this._invitedBy; }
  get token(): string { return this._token; }
  get status(): InvitationStatus { return this._status; }
  get expiresAt(): Date { return this._expiresAt; }
  get acceptedAt(): Date | null | undefined { return this._acceptedAt; }
  get lastSentAt(): Date { return this._lastSentAt; }
  get resendCount(): number { return this._resendCount; }
  get teacherMaxWeeklyHours(): number | null | undefined { return this._teacherMaxWeeklyHours; }
  get teacherEmploymentType(): EmploymentType | null | undefined { return this._teacherEmploymentType; }
  get capabilities(): string[] { return this._capabilities; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
}
