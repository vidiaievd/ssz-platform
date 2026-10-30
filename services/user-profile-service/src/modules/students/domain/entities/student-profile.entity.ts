import { BaseEntity } from '../../../../shared/domain/base.entity.js';
import { StudentProfileCompletedEvent } from '../events/student-profile-completed.event.js';
import type { TargetLanguage } from '../value-objects/target-language.vo.js';

export interface CreateStudentProfileProps {
  id: string;
  profileId: string;
  nativeLanguage?: string;
  targetLanguages?: TargetLanguage[];
}

export interface RehydrateStudentProfileProps extends CreateStudentProfileProps {
  dailyGoalMin?: number;
  translationLanguage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Account-level learning preferences. `undefined` leaves a field as it is, `null` clears it
 * (back to the app's default).
 */
export interface StudentPreferencesPatch {
  dailyGoalMin?: number | null;
  translationLanguage?: string | null;
}

export class StudentProfile extends BaseEntity {
  private _profileId: string;
  private _nativeLanguage: string | undefined;
  private _targetLanguages: TargetLanguage[];
  private _dailyGoalMin: number | undefined;
  private _translationLanguage: string | undefined;

  private constructor(
    id: string,
    profileId: string,
    nativeLanguage: string | undefined,
    targetLanguages: TargetLanguage[],
    createdAt: Date,
    updatedAt: Date,
    dailyGoalMin?: number,
    translationLanguage?: string,
  ) {
    super(id, createdAt, updatedAt);
    this._profileId = profileId;
    this._nativeLanguage = nativeLanguage;
    this._targetLanguages = targetLanguages;
    this._dailyGoalMin = dailyGoalMin;
    this._translationLanguage = translationLanguage;
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

  // Starts an empty student part for a learner who saves a preference before ever filling
  // the profile in. Raises no «profile completed» event — nothing was completed.
  static start(props: { id: string; profileId: string }): StudentProfile {
    const now = new Date();
    return new StudentProfile(
      props.id,
      props.profileId,
      undefined,
      [],
      now,
      now,
    );
  }

  static rehydrate(props: RehydrateStudentProfileProps): StudentProfile {
    return new StudentProfile(
      props.id,
      props.profileId,
      props.nativeLanguage,
      props.targetLanguages ?? [],
      props.createdAt,
      props.updatedAt,
      props.dailyGoalMin,
      props.translationLanguage,
    );
  }

  setPreferences(patch: StudentPreferencesPatch): void {
    if (patch.dailyGoalMin !== undefined) {
      this._dailyGoalMin = patch.dailyGoalMin ?? undefined;
    }
    if (patch.translationLanguage !== undefined) {
      this._translationLanguage = patch.translationLanguage ?? undefined;
    }
    this._updatedAt = new Date();
  }

  // Updates mutable scalar fields. Pass undefined to leave a field unchanged.
  update(nativeLanguage?: string): void {
    if (nativeLanguage !== undefined) {
      this._nativeLanguage = nativeLanguage;
    }
    this._updatedAt = new Date();
  }

  // Adds a target language. Returns true if added, false if code already exists.
  addTargetLanguage(lang: TargetLanguage): boolean {
    if (
      this._targetLanguages.some((l) => l.languageCode === lang.languageCode)
    ) {
      return false;
    }
    this._targetLanguages.push(lang);
    this._updatedAt = new Date();
    return true;
  }

  // Removes a target language by code. Returns true if removed, false if not found.
  removeTargetLanguage(code: string): boolean {
    const idx = this._targetLanguages.findIndex((l) => l.languageCode === code);
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
  get targetLanguages(): TargetLanguage[] {
    return [...this._targetLanguages];
  }
  get dailyGoalMin(): number | undefined {
    return this._dailyGoalMin;
  }
  get translationLanguage(): string | undefined {
    return this._translationLanguage;
  }
}
