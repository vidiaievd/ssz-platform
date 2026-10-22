export const SCHOOL_LANGUAGE_READER = Symbol('ISchoolLanguageReader');

/** The language a school explains in (`School.defaultExplanationLanguage`), from organization-service. */
export interface ISchoolLanguageReader {
  /** A language code as the school set it, or null when it set none. Throws when unreadable. */
  explanationLanguage(schoolId: string): Promise<string | null>;
}
