import { BaseEntity } from '../../../../shared/domain/base.entity.js';
import { StudentProfileCompletedEvent } from '../events/student-profile-completed.event.js';

export interface CreateStudentProfileProps {
  id: string;
  profileId: string;
  nativeLanguage?: string;
  targetLanguages?: string[];
}

export interface RehydrateStudentProfileProps extends CreateStudentProfileProps {
  createdAt: Date;
  updatedAt: Date;
}

export class StudentProfile extends BaseEntity {
  private _profileId: string;
  private _nativeLanguage: string | undefined;
  private _targetLanguages: string[];

  private constructor(
    id: string,
    profileId: string,
    nativeLanguage: string | undefined,
    targetLanguages: string[],
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._profileId = profileId;
    this._nativeLanguage = nativeLanguage;
    this._targetLanguages = targetLanguages;
  }

  static create(
    props: CreateStudentProfileProps,
    eventId: string,
  ): StudentProfile {
    const now = new Date();
    const entity = new StudentProfile(
      props.id,
      props.profileId,
      props.nativeLanguage,
      props.targetLanguages ?? [],
      now,
      now,
    );
    entity.addDomainEvent(
      new StudentProfileCompletedEvent(eventId, props.id, props.profileId),
    );
    return entity;
  }

  static rehydrate(props: RehydrateStudentProfileProps): StudentProfile {
    return new StudentProfile(
      props.id,
      props.profileId,
      props.nativeLanguage,
      props.targetLanguages ?? [],
      props.createdAt,
      props.updatedAt,
    );
  }

  // Adds a language code if not already present. Returns true if added.
  addTargetLanguage(code: string): boolean {
    if (this._targetLanguages.includes(code)) {
      return false;
    }
    this._targetLanguages.push(code);
    this._updatedAt = new Date();
    return true;
  }

  // Removes a language code. Returns true if removed, false if not found.
  removeTargetLanguage(code: string): boolean {
    const idx = this._targetLanguages.indexOf(code);
    if (idx === -1) {
      return false;
    }
    this._targetLanguages.splice(idx, 1);
    this._updatedAt = new Date();
    return true;
  }

  get profileId(): string {
    return this._profileId;
  }
  get nativeLanguage(): string | undefined {
    return this._nativeLanguage;
  }
  get targetLanguages(): string[] {
    return [...this._targetLanguages];
  }
}
