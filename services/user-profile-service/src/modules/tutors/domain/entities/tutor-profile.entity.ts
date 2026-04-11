import { BaseEntity } from '../../../../shared/domain/base.entity.js';
import { TutorProfileCompletedEvent } from '../events/tutor-profile-completed.event.js';
import type { TeachingLanguage } from '../value-objects/teaching-language.vo.js';

export interface CreateTutorProfileProps {
  id: string;
  profileId: string;
  hourlyRate?: number;
  yearsOfExperience?: number;
  teachingLanguages?: TeachingLanguage[];
}

export interface RehydrateTutorProfileProps extends CreateTutorProfileProps {
  createdAt: Date;
  updatedAt: Date;
}

export class TutorProfile extends BaseEntity {
  private _profileId: string;
  private _hourlyRate: number | undefined;
  private _yearsOfExperience: number | undefined;
  private _teachingLanguages: TeachingLanguage[];

  private constructor(
    id: string,
    profileId: string,
    hourlyRate: number | undefined,
    yearsOfExperience: number | undefined,
    teachingLanguages: TeachingLanguage[],
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._profileId = profileId;
    this._hourlyRate = hourlyRate;
    this._yearsOfExperience = yearsOfExperience;
    this._teachingLanguages = teachingLanguages;
  }

  static create(props: CreateTutorProfileProps, eventId: string): TutorProfile {
    const now = new Date();
    const entity = new TutorProfile(
      props.id,
      props.profileId,
      props.hourlyRate,
      props.yearsOfExperience,
      props.teachingLanguages ?? [],
      now,
      now,
    );
    entity.addDomainEvent(
      new TutorProfileCompletedEvent(eventId, props.id, props.profileId),
    );
    return entity;
  }

  static rehydrate(props: RehydrateTutorProfileProps): TutorProfile {
    return new TutorProfile(
      props.id,
      props.profileId,
      props.hourlyRate,
      props.yearsOfExperience,
      props.teachingLanguages ?? [],
      props.createdAt,
      props.updatedAt,
    );
  }

  // Adds a teaching language. Returns false if the language code already exists.
  addTeachingLanguage(lang: TeachingLanguage): boolean {
    if (
      this._teachingLanguages.some((l) => l.languageCode === lang.languageCode)
    ) {
      return false;
    }
    this._teachingLanguages.push(lang);
    this._updatedAt = new Date();
    return true;
  }

  // Removes a teaching language by code. Returns false if not found.
  removeTeachingLanguage(code: string): boolean {
    const idx = this._teachingLanguages.findIndex(
      (l) => l.languageCode === code,
    );
    if (idx === -1) {
      return false;
    }
    this._teachingLanguages.splice(idx, 1);
    this._updatedAt = new Date();
    return true;
  }

  get profileId(): string {
    return this._profileId;
  }
  get hourlyRate(): number | undefined {
    return this._hourlyRate;
  }
  get yearsOfExperience(): number | undefined {
    return this._yearsOfExperience;
  }
  get teachingLanguages(): TeachingLanguage[] {
    return [...this._teachingLanguages];
  }
}
