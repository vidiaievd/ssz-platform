export interface TutorTeachingLanguages {
  userId: string;
  langs: string[]; // ISO 639-1 codes
}

export interface IProfileServicePort {
  getTutorTeachingLanguages(userId: string): Promise<TutorTeachingLanguages | null>;
}

export const PROFILE_SERVICE_PORT = Symbol('IProfileServicePort');
