import { BaseEntity } from '../../../../shared/domain/base.entity.js';

export interface TeachingLanguageVO {
  code: string;
  level: string | undefined;
}

export interface CreateTeachingProfileProps {
  id: string;
  profileId: string;
  languages?: TeachingLanguageVO[];
}

export interface RehydrateTeachingProfileProps extends CreateTeachingProfileProps {
  createdAt: Date;
  updatedAt: Date;
}

export class TeachingProfile extends BaseEntity {
  private _profileId: string;
  private _languages: TeachingLanguageVO[];

  private constructor(
    id: string,
    profileId: string,
    languages: TeachingLanguageVO[],
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._profileId = profileId;
    this._languages = languages;
  }

  static create(props: CreateTeachingProfileProps): TeachingProfile {
    const now = new Date();
    return new TeachingProfile(
      props.id,
      props.profileId,
      props.languages ?? [],
      now,
      now,
    );
  }

  static rehydrate(props: RehydrateTeachingProfileProps): TeachingProfile {
    return new TeachingProfile(
      props.id,
      props.profileId,
      props.languages ?? [],
      props.createdAt,
      props.updatedAt,
    );
  }

  addLanguage(lang: TeachingLanguageVO): boolean {
    if (this._languages.some((l) => l.code === lang.code)) return false;
    this._languages.push(lang);
    this._updatedAt = new Date();
    return true;
  }

  removeLanguage(code: string): boolean {
    const idx = this._languages.findIndex((l) => l.code === code);
    if (idx === -1) return false;
    this._languages.splice(idx, 1);
    this._updatedAt = new Date();
    return true;
  }

  get profileId(): string { return this._profileId; }
  get languages(): TeachingLanguageVO[] { return [...this._languages]; }
}
