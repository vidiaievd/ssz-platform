import type { AgeBand } from './school-group.entity.js';

export type MembershipStatus = 'pending' | 'onboarding' | 'placement-review' | 'active' | 'rejected' | 'left';
export type MembershipSource = 'public-apply' | 'invite' | 'direct';

export interface CreateMembershipProps {
  id: string;
  schoolId: string;
  studentId: string;
  source: MembershipSource;
  language?: string;
  /** Student's own guess at their level when applying (e.g. "A1"). Not authoritative — superseded by placement results. */
  selfReportedLevel?: string;
}

export interface RehydrateMembershipProps extends CreateMembershipProps {
  status: MembershipStatus;
  availability: AvailabilitySlot[] | undefined;
  ageBand: AgeBand | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilitySlot {
  day: number; // 1=Mon..7=Sun
  from: string; // "HH:mm"
  to: string;   // "HH:mm"
}

const ALLOWED_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  pending: ['onboarding', 'rejected'],
  onboarding: ['placement-review'],
  'placement-review': ['active'],
  active: ['left'],
  rejected: [],
  left: [],
};

export class SchoolMembership {
  readonly id: string;
  readonly schoolId: string;
  readonly studentId: string;
  readonly source: MembershipSource;
  readonly language: string | undefined;
  readonly selfReportedLevel: string | undefined;
  readonly createdAt: Date;

  private _status: MembershipStatus;
  private _availability: AvailabilitySlot[] | undefined;
  private _ageBand: AgeBand | undefined;
  private _updatedAt: Date;

  private constructor(props: RehydrateMembershipProps) {
    this.id = props.id;
    this.schoolId = props.schoolId;
    this.studentId = props.studentId;
    this.source = props.source;
    this.language = props.language;
    this.selfReportedLevel = props.selfReportedLevel;
    this._status = props.status;
    this._availability = props.availability;
    this._ageBand = props.ageBand;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(props: CreateMembershipProps): SchoolMembership {
    const now = new Date();
    return new SchoolMembership({
      ...props,
      status: 'pending',
      availability: undefined,
      ageBand: undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateMembershipProps): SchoolMembership {
    return new SchoolMembership(props);
  }

  canTransitionTo(next: MembershipStatus): boolean {
    return ALLOWED_TRANSITIONS[this._status]?.includes(next) ?? false;
  }

  transitionTo(next: MembershipStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Invalid transition: ${this._status} → ${next}`);
    }
    this._status = next;
    this._updatedAt = new Date();
  }

  setAvailability(slots: AvailabilitySlot[]): void {
    this._availability = slots;
    this._updatedAt = new Date();
  }

  setAgeBand(ageBand: AgeBand): void {
    this._ageBand = ageBand;
    this._updatedAt = new Date();
  }

  get status(): MembershipStatus { return this._status; }
  get availability(): AvailabilitySlot[] | undefined { return this._availability; }
  get ageBand(): AgeBand | undefined { return this._ageBand; }
  get updatedAt(): Date { return this._updatedAt; }
}
