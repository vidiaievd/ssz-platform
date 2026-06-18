import { BaseEntity } from '../../../../shared/domain/base.entity.js';
import { ProfileCreatedEvent } from '../events/profile-created.event.js';
import { ProfileUpdatedEvent } from '../events/profile-updated.event.js';

export interface CreateProfileProps {
  id: string;
  userId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  timezone?: string;
  uiLocale?: string;
  guardianAccountId?: string;
  dateOfBirth?: Date;
  languagesOfInterest?: string[];
}

export interface UpdateProfileProps {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  timezone?: string;
  uiLocale?: string;
  guardianAccountId?: string;
  dateOfBirth?: Date;
  languagesOfInterest?: string[];
}

export interface RehydrateProfileProps extends CreateProfileProps {
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export class Profile extends BaseEntity {
  private _userId: string;
  private _displayName: string;
  private _firstName: string | undefined;
  private _lastName: string | undefined;
  private _avatarUrl: string | undefined;
  private _bio: string | undefined;
  private _timezone: string;
  private _uiLocale: string;
  private _guardianAccountId: string | undefined;
  private _dateOfBirth: Date | undefined;
  private _languagesOfInterest: string[];
  private _deletedAt: Date | undefined;

  private constructor(
    id: string,
    userId: string,
    displayName: string,
    firstName: string | undefined,
    lastName: string | undefined,
    avatarUrl: string | undefined,
    bio: string | undefined,
    timezone: string,
    uiLocale: string,
    guardianAccountId: string | undefined,
    dateOfBirth: Date | undefined,
    languagesOfInterest: string[],
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | undefined,
  ) {
    super(id, createdAt, updatedAt);
    this._userId = userId;
    this._displayName = displayName;
    this._firstName = firstName;
    this._lastName = lastName;
    this._avatarUrl = avatarUrl;
    this._bio = bio;
    this._timezone = timezone;
    this._uiLocale = uiLocale;
    this._guardianAccountId = guardianAccountId;
    this._dateOfBirth = dateOfBirth;
    this._languagesOfInterest = languagesOfInterest;
    this._deletedAt = deletedAt;
  }

  static create(props: CreateProfileProps, eventId: string): Profile {
    const now = new Date();
    const profile = new Profile(
      props.id,
      props.userId,
      props.displayName,
      props.firstName,
      props.lastName,
      props.avatarUrl,
      props.bio,
      props.timezone ?? 'UTC',
      props.uiLocale ?? 'en',
      props.guardianAccountId,
      props.dateOfBirth,
      props.languagesOfInterest ?? [],
      now,
      now,
      undefined,
    );

    profile.addDomainEvent(
      new ProfileCreatedEvent(eventId, props.id, props.userId, props.displayName),
    );

    return profile;
  }

  static rehydrate(props: RehydrateProfileProps): Profile {
    return new Profile(
      props.id,
      props.userId,
      props.displayName,
      props.firstName,
      props.lastName,
      props.avatarUrl,
      props.bio,
      props.timezone ?? 'UTC',
      props.uiLocale ?? 'en',
      props.guardianAccountId,
      props.dateOfBirth,
      props.languagesOfInterest ?? [],
      props.createdAt,
      props.updatedAt,
      props.deletedAt,
    );
  }

  updateBasicInfo(props: UpdateProfileProps, eventId: string): void {
    const changedFields: string[] = [];
    if (props.displayName !== undefined && props.displayName !== this._displayName) {
      this._displayName = props.displayName;
      changedFields.push('displayName');
    }
    if (props.firstName !== undefined && props.firstName !== this._firstName) {
      this._firstName = props.firstName;
      changedFields.push('firstName');
    }
    if (props.lastName !== undefined && props.lastName !== this._lastName) {
      this._lastName = props.lastName;
      changedFields.push('lastName');
    }
    if (props.avatarUrl !== undefined && props.avatarUrl !== this._avatarUrl) {
      this._avatarUrl = props.avatarUrl;
      changedFields.push('avatarUrl');
    }
    if (props.bio !== undefined && props.bio !== this._bio) {
      this._bio = props.bio;
      changedFields.push('bio');
    }
    if (props.timezone !== undefined && props.timezone !== this._timezone) {
      this._timezone = props.timezone;
      changedFields.push('timezone');
    }
    if (props.uiLocale !== undefined && props.uiLocale !== this._uiLocale) {
      this._uiLocale = props.uiLocale;
      changedFields.push('uiLocale');
    }
    if (props.guardianAccountId !== undefined && props.guardianAccountId !== this._guardianAccountId) {
      this._guardianAccountId = props.guardianAccountId;
      changedFields.push('guardianAccountId');
    }
    if (props.dateOfBirth !== undefined && props.dateOfBirth?.getTime() !== this._dateOfBirth?.getTime()) {
      this._dateOfBirth = props.dateOfBirth;
      changedFields.push('dateOfBirth');
    }
    if (props.languagesOfInterest !== undefined) {
      this._languagesOfInterest = props.languagesOfInterest;
      changedFields.push('languagesOfInterest');
    }
    this._updatedAt = new Date();

    this.addDomainEvent(
      new ProfileUpdatedEvent(eventId, this._id, this._userId, this._displayName, changedFields),
    );
  }

  softDelete(): void {
    this._deletedAt = new Date();
    this._updatedAt = new Date();
  }

  get userId(): string { return this._userId; }
  get displayName(): string { return this._displayName; }
  get firstName(): string | undefined { return this._firstName; }
  get lastName(): string | undefined { return this._lastName; }
  get avatarUrl(): string | undefined { return this._avatarUrl; }
  get bio(): string | undefined { return this._bio; }
  get timezone(): string { return this._timezone; }
  get uiLocale(): string { return this._uiLocale; }
  get guardianAccountId(): string | undefined { return this._guardianAccountId; }
  get dateOfBirth(): Date | undefined { return this._dateOfBirth; }
  get languagesOfInterest(): string[] { return this._languagesOfInterest; }
  get deletedAt(): Date | undefined { return this._deletedAt; }
  get isDeleted(): boolean { return this._deletedAt !== undefined; }
}
