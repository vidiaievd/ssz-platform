/**
 * The languages a container can be taught in, as ISO 639-1 codes.
 *
 * A closed list rather than free text (web plan 52, Q9). The column is
 * `VARCHAR(10) NOT NULL` and every row already holds a proper code — but nothing on this
 * side rejected `Norwegian` or `xx`, and a code that is only usually normalised cannot be
 * matched against by anything downstream that reasons about the language of a course.
 *
 * Kept in step with `languageCodes` in ssz-platform-web
 * (`src/features/content-authoring/schemas/container.ts`). Bokmål and nynorsk are listed
 * separately, as the data has them; there is no `no`, because the macrolanguage would
 * mean "one of the two", which is not something a course can be.
 *
 * Lessons, exercises, vocabulary lists and grammar rules are not constrained here: they
 * are created with the language of the container they belong to, so the one gate is at
 * the container.
 */
export const TARGET_LANGUAGES = [
  'nb',
  'nn',
  'sv',
  'da',
  'fi',
  'en',
  'de',
  'nl',
  'fr',
  'es',
  'it',
  'pt',
  'pl',
  'uk',
  'ru',
  'tr',
  'ar',
  'zh',
  'ja',
  'ko',
] as const;

export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];
