/**
 * What an AI check tells the learner about their work (plan 84 §2). One shape for every
 * template and every agent, so plans 85 (errors → rule atoms → SRS) and 86 (pronunciation)
 * fill fields of it rather than change it.
 */

/** What a remark is about. */
export type AiFeedbackKind = 'grammar' | 'lexis' | 'spelling' | 'pronunciation' | 'fluency' | 'content';

export type AiFeedbackSeverity = 'minor' | 'major';

/** Kinds of atom a remark can point at (plan 63 addressing). */
export type AiFeedbackAtomType = 'grammar_rule_atom' | 'vocabulary_item' | 'sound';

export interface AiFeedbackAtomRef {
  atomType: AiFeedbackAtomType;
  atomId: string;
}

/**
 * Where in the learner's answer a remark points. Every field is optional: a text remark
 * carries a `span`, a voice remark a `wordIndex` within a `passageIndex`, a remark on the
 * whole answer none of them.
 */
export interface AiFeedbackTarget {
  /** Character offsets into the answer, end exclusive. */
  span?: [number, number];
  /** Index into `AiFeedback.words`. */
  wordIndex?: number;
  /** Which passage / item of the exercise the remark is about. */
  passageIndex?: number;
}

export interface AiFeedbackItem {
  kind: AiFeedbackKind;
  target: AiFeedbackTarget;
  /** The learner's fragment, verbatim. */
  original?: string;
  suggestion?: string;
  /** In the school's explanation language. */
  explanation: string;
  /** The rule or word the mistake is about. Always null until plan 85 fills it. */
  atomRef: AiFeedbackAtomRef | null;
  severity: AiFeedbackSeverity;
}

/** One sound of a word, as the provider scored it. Empty until plan 86. */
export interface AiFeedbackPhoneme {
  symbol: string;
  /** 0–100. */
  accuracy?: number;
}

/** One word of a spoken answer, in the order heard. */
export interface AiFeedbackWord {
  text: string;
  /** Which passage of the exercise the word was read in, 0-based. */
  passageIndex?: number;
  /** 0–100; absent when the provider gives no pronunciation scores. */
  accuracy?: number;
  startMs?: number;
  endMs?: number;
  phonemes?: AiFeedbackPhoneme[];
}

export interface AiFeedback {
  /**
   * In the school's explanation language. Empty for a voice answer until plan 86, where a
   * model explains what the speech model measured.
   */
  summary: string;
  items: AiFeedbackItem[];
  /** Voice answers only. */
  words?: AiFeedbackWord[];
}
