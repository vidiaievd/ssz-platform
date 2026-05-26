import { InvitationStatus } from '../value-objects/invitation-status.vo.js';

export interface TutoringInvitationProps {
  id: string;
  tutorGroupId: string;
  email: string;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class TutoringInvitation {
  private readonly _id: string;
  private readonly _tutorGroupId: string;
  private readonly _email: string;
  private readonly _token: string;
  private _status: InvitationStatus;
  private readonly _expiresAt: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: TutoringInvitationProps) {
    this._id = props.id;
    this._tutorGroupId = props.tutorGroupId;
    this._email = props.email;
    this._token = props.token;
    this._status = props.status;
    this._expiresAt = props.expiresAt;
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
  get tutorGroupId(): string { return this._tutorGroupId; }
  get email(): string { return this._email; }
  get token(): string { return this._token; }
  get status(): InvitationStatus { return this._status; }
  get expiresAt(): Date { return this._expiresAt; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
}
