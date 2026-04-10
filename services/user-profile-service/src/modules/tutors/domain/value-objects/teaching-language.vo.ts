export const Proficiency = {
  NATIVE: 'NATIVE',
  FLUENT: 'FLUENT',
  ADVANCED: 'ADVANCED',
  INTERMEDIATE: 'INTERMEDIATE',
} as const;

export type Proficiency = (typeof Proficiency)[keyof typeof Proficiency];

export interface TeachingLanguage {
  languageCode: string;
  proficiency: Proficiency;
}
