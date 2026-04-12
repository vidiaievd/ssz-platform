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
  locale?: string;
}

export interface UpdateProfileProps {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  timezone?: string;
  locale?: string;
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
  private _locale: string;
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
    locale: string,
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
    this._locale = locale;
    this._deletedAt = deletedAt;
  }

  // Factory method for creating a new profile (raises domain event)
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
      props.locale ?? 'en',
      now,
      now,
      undefined,
    );

    profile.addDomainEvent(
      new ProfileCreatedEvent(eventId, props.id, props.userId, props.displayName),
    );

    return profile;
  }

  // Rehydrate a profile from persistence — no domain event raised
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
      props.locale ?? 'en',
      props.createdAt,
      props.updatedAt,
      props.deletedAt,
    );
  }

  updateBasicInfo(props: UpdateProfileProps, eventId: string): void {
    if (props.displayName !== undefined) this._displayName = props.displayName;
    if (props.firstName !== undefined) this._firstName = props.firstName;
    if (props.lastName !== undefined) this._lastName = props.lastName;
    if (props.avatarUrl !== undefined) this._avatarUrl = props.avatarUrl;
    if (props.bio !== undefined) this._bio = props.bio;
    if (props.timezone !== undefined) this._timezone = props.timezone;
    if (props.locale !== undefined) this._locale = props.locale;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new ProfileUpdatedEvent(eventId, this._id, this._userId),
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
  get locale(): string { return this._locale; }
  get deletedAt(): Date | undefined { return this._deletedAt; }
  get isDeleted(): boolean { return this._deletedAt !== undefined; }
}
