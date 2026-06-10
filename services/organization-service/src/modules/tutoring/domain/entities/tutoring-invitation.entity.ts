import { InvitationStatus } from '../value-objects/invitation-status.vo.js';

export interface TutoringInvitationProps {
  id: string;
  tutorGroupId: string;
  email: string;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date | null;
  lastSentAt: Date;
  resendCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class TutoringInvitation {
  private readonly _id: string;
  private readonly _tutorGroupId: string;
  private readonly _email: string;
  private _token: string;
  private _status: InvitationStatus;
  private _expiresAt: Date;
  private _acceptedAt: Date | null | undefined;
  private _lastSentAt: Date;
  private _resendCount: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: TutoringInvitationProps) {
    this._id = props.id;
    this._tutorGroupId = props.tutorGroupId;
    this._email = props.email;
    this._token = props.token;
    this._status = props.status;
    this._expiresAt = props.expiresAt;
    this._acceptedAt = props.acceptedAt;
    this._lastSentAt = props.lastSentAt;
    this._resendCount = props.resendCount;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(props: TutoringInvitationProps): TutoringInvitation {
    return new TutoringInvitation(props);
  }

  static rehydrate(props: TutoringInvitationProps): TutoringInvitation {
    return new TutoringInvitation(props);
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
  get tutorGroupId(): string { return this._tutorGroupId; }
  get email(): string { return this._email; }
  get token(): string { return this._token; }
  get status(): InvitationStatus { return this._status; }
  get expiresAt(): Date { return this._expiresAt; }
  get acceptedAt(): Date | null | undefined { return this._acceptedAt; }
  get lastSentAt(): Date { return this._lastSentAt; }
  get resendCount(): number { return this._resendCount; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
}
