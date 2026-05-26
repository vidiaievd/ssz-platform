export const CefrLevel = {
  A1: 'A1',
  A2: 'A2',
  B1: 'B1',
  B2: 'B2',
  C1: 'C1',
  C2: 'C2',
} as const;

export type CefrLevel = (typeof CefrLevel)[keyof typeof CefrLevel];

export interface TargetLanguage {
  languageCode: string;
  level?: CefrLevel;
}
