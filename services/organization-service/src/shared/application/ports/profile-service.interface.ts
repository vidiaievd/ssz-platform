export interface TeachingLanguages {
  userId: string;
  langs: string[]; // ISO 639-1 codes
}

export interface ProfileSummary {
  userId: string;
  name: string;        // displayName
  avatarUrl: string | null;
}

export interface IProfileServicePort {
  getTeachingLanguages(userId: string): Promise<TeachingLanguages | null>;
  getProfileSummary(userId: string): Promise<ProfileSummary | null>;
}

export const PROFILE_SERVICE_PORT = Symbol('IProfileServicePort');
