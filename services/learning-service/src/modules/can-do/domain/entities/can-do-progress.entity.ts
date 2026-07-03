export type CanDoStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'ACHIEVED';

export interface CanDoProgressProps {
  userId: string;
  descriptorId: string;
  status: CanDoStatus;
  achievedAt: Date | null;
  selfAssessed: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CanDoProgressEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly descriptorId: string,
    private _status: CanDoStatus,
    private _achievedAt: Date | null,
    private _selfAssessed: boolean | null,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  get status(): CanDoStatus         { return this._status; }
  get achievedAt(): Date | null      { return this._achievedAt; }
  get selfAssessed(): boolean | null { return this._selfAssessed; }
  get updatedAt(): Date              { return this._updatedAt; }

  markInProgress(): void {
    if (this._status === 'NOT_STARTED') {
      this._status = 'IN_PROGRESS';
      this._updatedAt = new Date();
    }
  }

  // achievedAt is sticky — never reverts once set.
  markAchieved(): void {
    if (this._status !== 'ACHIEVED') {
      this._status = 'ACHIEVED';
      this._achievedAt = this._achievedAt ?? new Date();
      this._updatedAt = new Date();
    }
  }

  setSelfAssessed(value: boolean): void {
    this._selfAssessed = value;
    this._updatedAt = new Date();
  }

  static create(userId: string, descriptorId: string, id: string): CanDoProgressEntity {
    const now = new Date();
    return new CanDoProgressEntity(id, userId, descriptorId, 'NOT_STARTED', null, null, now, now);
  }

  static reconstitute(id: string, props: CanDoProgressProps): CanDoProgressEntity {
    return new CanDoProgressEntity(
      id,
      props.userId,
      props.descriptorId,
      props.status,
      props.achievedAt,
      props.selfAssessed,
      props.createdAt,
      props.updatedAt,
    );
  }
}
