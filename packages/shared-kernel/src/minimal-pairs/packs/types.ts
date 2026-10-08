// The shape of a language pack for `minimal_pairs` (plan 72 §3.3).

/**
 * What synthetic speech does to a contrast (DECISIONS §2):
 *   ok    — a neutral voice reproduces it reliably
 *   risky — reproduced, but engine-dependent; publishable with a warning
 *   no    — the engine merges exactly the distinction under test. A blocker, and the TTS button
 *           is disabled rather than warned: the exercise would teach the merger.
 */
export type TtsPolicy = 'ok' | 'risky' | 'no';

/** The prototype's card icons, named rather than drawn — the UI maps them. */
export type ContrastIcon = 'target' | 'text' | 'sparkle' | 'wave' | 'split';

export interface ContrastFamily {
  id: string;
  /** Seen by the student too: «kj / sj». */
  label: string;
  ipa: string;
  tts: TtsPolicy;
  icon: ContrastIcon;
  /** Every clip of a pair in this family must say which dialect it was recorded in. */
  needsDialect: boolean;
}

export interface Dialect {
  id: string;
  /** In the builder's segmented control. */
  label: string;
  /** Under the student's player. */
  student: string;
}

/** Content-language strings the builder shows as placeholders. */
export interface PackPlaceholders {
  title: string;
  instruction: string;
  words: [string, string];
  gloss: string;
  ipa: string;
  note: string;
}

export interface LanguagePack {
  language: string;
  contrasts: ContrastFamily[];
  dialects: Dialect[];
  /** Known pairs per family, words only. */
  library: Record<string, [string, string][]>;
  placeholders: PackPlaceholders;
}
