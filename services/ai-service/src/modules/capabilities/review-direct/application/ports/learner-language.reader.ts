export const LEARNER_LANGUAGE_READER = Symbol('ILearnerLanguageReader');

/** The language a learner reads the platform in (`Profile.uiLocale`), from user-profile-service. */
export interface ILearnerLanguageReader {
  /** A locale code (`en`, `nb`), or null when the learner has no profile. Throws when unreadable. */
  interfaceLanguage(userId: string): Promise<string | null>;
}
