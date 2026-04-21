import { BaseEntity } from '../../../../shared/domain/base.entity.js';
import { SchoolCreatedEvent } from '../events/school-created.event.js';
import { SchoolMemberAddedEvent } from '../events/school-member-added.event.js';
import { SchoolMemberRemovedEvent } from '../events/school-member-removed.event.js';
import { ForbiddenOperationException } from '../exceptions/forbidden-operation.exception.js';
import { MemberAlreadyExistsException } from '../exceptions/member-already-exists.exception.js';
import { MemberRole } from '../value-objects/member-role.vo.js';
import type { SchoolMember } from './school-member.entity.js';

export interface CreateSchoolProps {
  id: string;
  name: string;
  ownerId: string;
  description?: string;
  avatarUrl?: string;
}

export interface RehydrateSchoolProps extends CreateSchoolProps {
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  members: SchoolMember[];
  requireTutorReviewForSelfPaced: boolean;
  defaultExplanationLanguage?: string;
}

export class School extends BaseEntity {
  private _name: string;
  private _ownerId: string;
  private _description: string | undefined;
  private _avatarUrl: string | undefined;
  private _isActive: boolean;
  private _deletedAt: Date | undefined;
  private _members: SchoolMember[];
  private _requireTutorReviewForSelfPaced: boolean;
  private _defaultExplanationLanguage: string | undefined;

  private constructor(
    id: string,
    name: string,
    ownerId: string,
    description: string | undefined,
    avatarUrl: string | undefined,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | undefined,
    members: SchoolMember[],
    requireTutorReviewForSelfPaced: boolean,
    defaultExplanationLanguage: string | undefined,
  ) {
    super(id, createdAt, updatedAt);
    this._name = name;
    this._ownerId = ownerId;
    this._description = description;
    this._avatarUrl = avatarUrl;
    this._isActive = isActive;
    this._deletedAt = deletedAt;
    this._members = members;
    this._requireTutorReviewForSelfPaced = requireTutorReviewForSelfPaced;
    this._defaultExplanationLanguage = defaultExplanationLanguage;
  }

  static create(props: CreateSchoolProps, eventId: string): School {
    const now = new Date();
    const school = new School(
      props.id,
      props.name,
      props.ownerId,
      props.description,
      props.avatarUrl,
      true,
      now,
      now,
      undefined,
      [],
      false,
      undefined,
    );

    school.addDomainEvent(
      new SchoolCreatedEvent(eventId, props.id, props.ownerId, props.name),
    );

    return school;
  }

  static rehydrate(props: RehydrateSchoolProps): School {
    return new School(
      props.id,
      props.name,
      props.ownerId,
      props.description,
      props.avatarUrl,
      props.isActive,
      props.createdAt,
      props.updatedAt,
      props.deletedAt,
      props.members,
      props.requireTutorReviewForSelfPaced,
      props.defaultExplanationLanguage,
    );
  }

  update(props: {
    name?: string;
    description?: string;
    avatarUrl?: string;
    requireTutorReviewForSelfPaced?: boolean;
    defaultExplanationLanguage?: string | null;
  }): void {
    if (props.name !== undefined) this._name = props.name;
    if (props.description !== undefined) this._description = props.description;
    if (props.avatarUrl !== undefined) this._avatarUrl = props.avatarUrl;
    if (props.requireTutorReviewForSelfPaced !== undefined)
      this._requireTutorReviewForSelfPaced = props.requireTutorReviewForSelfPaced;
    if (props.defaultExplanationLanguage !== undefined)
      this._defaultExplanationLanguage = props.defaultExplanationLanguage ?? undefined;
    this._updatedAt = new Date();
  }

  addMember(member: SchoolMember, actorId: string, eventId: string): void {
    const actor = this._members.find((m) => m.userId === actorId);
    if (!actor && actorId !== this._ownerId) {
      throw new ForbiddenOperationException('Only members can add other members');
    }

    const existing = this._members.find((m) => m.userId === member.userId);
    if (existing) {
      throw new MemberAlreadyExistsException(member.userId, this._id);
    }

    this._members.push(member);
    this._updatedAt = new Date();
    this.addDomainEvent(
      new SchoolMemberAddedEvent(eventId, this._id, member.userId, member.role),
    );
  }

  removeMember(userId: string, actorId: string, eventId: string): void {
    if (userId === this._ownerId) {
      throw new ForbiddenOperationException('Owner cannot be removed from the school');
    }

    const actor = this._members.find((m) => m.userId === actorId);
    const canRemove =
      actorId === this._ownerId ||
      actor?.role === MemberRole.ADMIN ||
      actorId === userId;

    if (!canRemove) {
      throw new ForbiddenOperationException('Insufficient permissions to remove this member');
    }

    const idx = this._members.findIndex((m) => m.userId === userId);
    if (idx !== -1) {
      this._members.splice(idx, 1);
      this._updatedAt = new Date();
      this.addDomainEvent(
        new SchoolMemberRemovedEvent(eventId, this._id, userId),
      );
    }
  }

  softDelete(actorId: string): void {
    if (actorId !== this._ownerId) {
      throw new ForbiddenOperationException('Only the owner can delete the school');
    }
    this._deletedAt = new Date();
    this._isActive = false;
    this._updatedAt = new Date();
  }

  isMember(userId: string): boolean {
    return this._members.some((m) => m.userId === userId);
  }

  getMemberRole(userId: string): MemberRole | undefined {
    return this._members.find((m) => m.userId === userId)?.role;
  }

  get name(): string { return this._name; }
  get ownerId(): string { return this._ownerId; }
  get description(): string | undefined { return this._description; }
  get avatarUrl(): string | undefined { return this._avatarUrl; }
  get isActive(): boolean { return this._isActive; }
  get deletedAt(): Date | undefined { return this._deletedAt; }
  get isDeleted(): boolean { return this._deletedAt !== undefined; }
  get members(): SchoolMember[] { return [...this._members]; }
  get requireTutorReviewForSelfPaced(): boolean { return this._requireTutorReviewForSelfPaced; }
  get defaultExplanationLanguage(): string | undefined { return this._defaultExplanationLanguage; }
}
