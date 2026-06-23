export interface SchoolGroupMemberProps {
  id: string;
  groupId: string;
  userId: string;
  addedAt: Date;
}

export type GroupStatus = 'draft' | 'active' | 'archived';
export type GroupMode = 'online' | 'in_person';
export type GroupTeacherRole = 'primary' | 'co_primary' | 'substitute';
export type AgeBand = 'kids' | 'teens' | 'adults';

export interface GroupTeacherProps {
  id: string;
  groupId: string;
  userId: string;
  role: GroupTeacherRole;
  fromDate?: Date | null;
  toDate?: Date | null;
  reason?: string | null;
  createdAt: Date;
}

/**
 * Additional course materials attached to a group, distinct from the
 * group's main material (SchoolGroupProps.courseId). See update()'s guard
 * against clearing an already-set courseId — the main material can be
 * reassigned but never removed outright; additional materials have no
 * such restriction.
 */
export interface GroupMaterialProps {
  id: string;
  groupId: string;
  courseId: string;
  addedAt: Date;
}

export interface SchoolGroupProps {
  id: string;
  schoolId: string;
  name: string;
  description?: string | null;
  status: GroupStatus;
  mode: GroupMode;
  courseId?: string | null;
  lang?: string | null;
  level?: string | null;
  ageBand?: AgeBand | null;
  capacityMin?: number | null;
  capacityMax?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  members: SchoolGroupMemberProps[];
  teachers: GroupTeacherProps[];
  materials: GroupMaterialProps[];
}

export interface UpdateGroupProps {
  name?: string;
  description?: string | null;
  mode?: GroupMode;
  courseId?: string | null;
  lang?: string | null;
  level?: string | null;
  ageBand?: AgeBand | null;
  capacityMin?: number | null;
  capacityMax?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

export class SchoolGroupMember {
  constructor(private readonly props: SchoolGroupMemberProps) {}

  get id(): string { return this.props.id; }
  get groupId(): string { return this.props.groupId; }
  get userId(): string { return this.props.userId; }
  get addedAt(): Date { return this.props.addedAt; }
}

export class SchoolGroup {
  private readonly _props: SchoolGroupProps;

  private constructor(props: SchoolGroupProps) {
    this._props = { ...props };
  }

  static create(
    props: Omit<SchoolGroupProps, 'createdAt' | 'updatedAt' | 'deletedAt' | 'members' | 'teachers' | 'materials' | 'status' | 'mode'> & { mode?: GroupMode },
  ): SchoolGroup {
    const now = new Date();
    return new SchoolGroup({
      ...props,
      status: 'draft',
      mode: props.mode ?? 'online',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      members: [],
      teachers: [],
      materials: [],
    });
  }

  static rehydrate(props: SchoolGroupProps): SchoolGroup {
    return new SchoolGroup(props);
  }

  /**
   * Throws if `fields` would clear an already-assigned main material back to
   * null. The HTTP-meaningful rejection happens at the handler level (see
   * UpdateSchoolGroupHandler) — this is defense in depth for any other
   * caller of update().
   */
  update(fields: UpdateGroupProps): void {
    if (fields.courseId === null && this._props.courseId != null) {
      throw new Error('Main material cannot be cleared once set — reassign it instead');
    }
    if (fields.name !== undefined) this._props.name = fields.name;
    if (fields.description !== undefined) this._props.description = fields.description;
    if (fields.mode !== undefined) this._props.mode = fields.mode;
    if (fields.courseId !== undefined) this._props.courseId = fields.courseId;
    if (fields.lang !== undefined) this._props.lang = fields.lang;
    if (fields.level !== undefined) this._props.level = fields.level;
    if (fields.ageBand !== undefined) this._props.ageBand = fields.ageBand;
    if (fields.capacityMin !== undefined) this._props.capacityMin = fields.capacityMin;
    if (fields.capacityMax !== undefined) this._props.capacityMax = fields.capacityMax;
    if (fields.startDate !== undefined) this._props.startDate = fields.startDate;
    if (fields.endDate !== undefined) this._props.endDate = fields.endDate;
    this._props.updatedAt = new Date();
  }

  /**
   * Validates and transitions group from draft → active.
   * Returns an array of blocker codes; empty array means success.
   */
  publish(): string[] {
    const blockers: string[] = [];
    if (!this._props.courseId) blockers.push('no-course');
    if (!this.primaryTeacherId) blockers.push('no-primary');
    if (this._props.status === 'archived') blockers.push('already-archived');
    if (blockers.length > 0) return blockers;
    this._props.status = 'active';
    this._props.updatedAt = new Date();
    return [];
  }

  archive(): void {
    if (this._props.status !== 'archived') {
      this._props.status = 'archived';
      this._props.updatedAt = new Date();
    }
  }

  delete(): void {
    this._props.deletedAt = new Date();
    this._props.updatedAt = new Date();
  }

  /**
   * Hard-delete is only allowed for empty draft/archived groups with no lessons.
   * The caller (handler) is responsible for checking lesson count via scheduling-service.
   */
  canHardDelete(): boolean {
    return (
      (this._props.status === 'draft' || this._props.status === 'archived') &&
      this._props.members.length === 0
    );
  }

  addMember(member: SchoolGroupMemberProps): void {
    const exists = this._props.members.some((m) => m.userId === member.userId);
    if (!exists) this._props.members.push(member);
  }

  removeMember(userId: string): void {
    this._props.members = this._props.members.filter((m) => m.userId !== userId);
  }

  get id(): string { return this._props.id; }
  get schoolId(): string { return this._props.schoolId; }
  get name(): string { return this._props.name; }
  get description(): string | null | undefined { return this._props.description; }
  get status(): GroupStatus { return this._props.status; }
  get mode(): GroupMode { return this._props.mode; }
  get courseId(): string | null | undefined { return this._props.courseId; }
  get lang(): string | null | undefined { return this._props.lang; }
  get level(): string | null | undefined { return this._props.level; }
  get ageBand(): AgeBand | null | undefined { return this._props.ageBand; }
  get capacityMin(): number | null | undefined { return this._props.capacityMin; }
  get capacityMax(): number | null | undefined { return this._props.capacityMax; }
  get startDate(): Date | null | undefined { return this._props.startDate; }
  get endDate(): Date | null | undefined { return this._props.endDate; }
  get createdAt(): Date { return this._props.createdAt; }
  get updatedAt(): Date { return this._props.updatedAt; }
  get deletedAt(): Date | null | undefined { return this._props.deletedAt; }
  get isDeleted(): boolean { return !!this._props.deletedAt; }
  get members(): SchoolGroupMemberProps[] { return [...this._props.members]; }
  get memberUserIds(): string[] { return this._props.members.map((m) => m.userId); }
  get studentCount(): number { return this._props.members.length; }
  get teachers(): GroupTeacherProps[] { return [...this._props.teachers]; }
  get primaryTeacherId(): string | undefined {
    return this._props.teachers.find((t) => t.role === 'primary')?.userId;
  }
  get materials(): GroupMaterialProps[] { return [...this._props.materials]; }

  setTeachers(teachers: GroupTeacherProps[]): void {
    this._props.teachers = teachers;
  }

  setMaterials(materials: GroupMaterialProps[]): void {
    this._props.materials = materials;
  }
}
