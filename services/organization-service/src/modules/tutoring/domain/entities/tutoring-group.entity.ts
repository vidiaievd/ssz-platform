import { BaseEntity } from '../../../../shared/domain/base.entity.js';
import { TutoringGroupCreatedEvent } from '../events/tutoring-group-created.event.js';
import { TutoringStudentAddedEvent } from '../events/tutoring-student-added.event.js';
import { TutoringStudentRemovedEvent } from '../events/tutoring-student-removed.event.js';
import { ForbiddenOperationException } from '../exceptions/forbidden-operation.exception.js';
import { StudentAlreadyExistsException } from '../exceptions/student-already-exists.exception.js';
import type { TutoringStudent } from './tutoring-student.entity.js';

export interface CreateTutoringGroupProps {
  id: string;
  tutorId: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
}

export interface RehydrateTutoringGroupProps extends CreateTutoringGroupProps {
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  students: TutoringStudent[];
}

export class TutoringGroup extends BaseEntity {
  private _tutorId: string;
  private _name: string | undefined;
  private _description: string | undefined;
  private _avatarUrl: string | undefined;
  private _isActive: boolean;
  private _deletedAt: Date | undefined;
  private _students: TutoringStudent[];

  private constructor(
    id: string,
    tutorId: string,
    name: string | undefined,
    description: string | undefined,
    avatarUrl: string | undefined,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | undefined,
    students: TutoringStudent[],
  ) {
    super(id, createdAt, updatedAt);
    this._tutorId = tutorId;
    this._name = name;
    this._description = description;
    this._avatarUrl = avatarUrl;
    this._isActive = isActive;
    this._deletedAt = deletedAt;
    this._students = students;
  }

  static create(props: CreateTutoringGroupProps, eventId: string): TutoringGroup {
    const now = new Date();
    const group = new TutoringGroup(
      props.id,
      props.tutorId,
      props.name,
      props.description,
      props.avatarUrl,
      true,
      now,
      now,
      undefined,
      [],
    );

    group.addDomainEvent(
      new TutoringGroupCreatedEvent(eventId, props.id, props.tutorId),
    );

    return group;
  }

  static rehydrate(props: RehydrateTutoringGroupProps): TutoringGroup {
    return new TutoringGroup(
      props.id,
      props.tutorId,
      props.name,
      props.description,
      props.avatarUrl,
      props.isActive,
      props.createdAt,
      props.updatedAt,
      props.deletedAt,
      props.students,
    );
  }

  update(props: {
    name?: string;
    description?: string;
    avatarUrl?: string;
  }): void {
    if (props.name !== undefined) this._name = props.name;
    if (props.description !== undefined) this._description = props.description;
    if (props.avatarUrl !== undefined) this._avatarUrl = props.avatarUrl;
    this._updatedAt = new Date();
  }

  addStudent(student: TutoringStudent, eventId: string): void {
    const existing = this._students.find((s) => s.userId === student.userId);
    if (existing) {
      throw new StudentAlreadyExistsException(student.userId, this._id);
    }

    this._students.push(student);
    this._updatedAt = new Date();
    this.addDomainEvent(
      new TutoringStudentAddedEvent(eventId, this._id, student.userId),
    );
  }

  removeStudent(userId: string, actorId: string, eventId: string): void {
    const isTutor = actorId === this._tutorId;
    const isSelf = actorId === userId;

    if (!isTutor && !isSelf) {
      throw new ForbiddenOperationException('Only the tutor or the student themselves can remove a student');
    }

    const idx = this._students.findIndex((s) => s.userId === userId);
    if (idx !== -1) {
      this._students.splice(idx, 1);
      this._updatedAt = new Date();
      this.addDomainEvent(
        new TutoringStudentRemovedEvent(eventId, this._id, userId),
      );
    }
  }

  softDelete(actorId: string): void {
    if (actorId !== this._tutorId) {
      throw new ForbiddenOperationException('Only the tutor can delete the group');
    }
    this._deletedAt = new Date();
    this._isActive = false;
    this._updatedAt = new Date();
  }

  isStudent(userId: string): boolean {
    return this._students.some((s) => s.userId === userId);
  }

  get tutorId(): string { return this._tutorId; }
  get name(): string | undefined { return this._name; }
  get description(): string | undefined { return this._description; }
  get avatarUrl(): string | undefined { return this._avatarUrl; }
  get isActive(): boolean { return this._isActive; }
  get deletedAt(): Date | undefined { return this._deletedAt; }
  get isDeleted(): boolean { return this._deletedAt !== undefined; }
  get students(): TutoringStudent[] { return [...this._students]; }
}
