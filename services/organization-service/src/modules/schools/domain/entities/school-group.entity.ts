export interface SchoolGroupMemberProps {
  id: string;
  groupId: string;
  userId: string;
  addedAt: Date;
}

export interface SchoolGroupProps {
  id: string;
  schoolId: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  members: SchoolGroupMemberProps[];
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

  static create(props: Omit<SchoolGroupProps, 'createdAt' | 'updatedAt' | 'deletedAt' | 'members'>): SchoolGroup {
    const now = new Date();
    return new SchoolGroup({ ...props, createdAt: now, updatedAt: now, deletedAt: null, members: [] });
  }

  static rehydrate(props: SchoolGroupProps): SchoolGroup {
    return new SchoolGroup(props);
  }

  update(name?: string, description?: string | null): void {
    if (name !== undefined) this._props.name = name;
    if (description !== undefined) this._props.description = description;
    this._props.updatedAt = new Date();
  }

  delete(): void {
    this._props.deletedAt = new Date();
    this._props.updatedAt = new Date();
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
  get createdAt(): Date { return this._props.createdAt; }
  get updatedAt(): Date { return this._props.updatedAt; }
  get deletedAt(): Date | null | undefined { return this._props.deletedAt; }
  get isDeleted(): boolean { return !!this._props.deletedAt; }
  get members(): SchoolGroupMemberProps[] { return [...this._props.members]; }
  get memberUserIds(): string[] { return this._props.members.map((m) => m.userId); }
}
