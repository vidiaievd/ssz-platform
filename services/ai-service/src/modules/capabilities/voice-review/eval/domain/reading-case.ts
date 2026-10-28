/** One prompt a teacher ruled on by ear: the passage, the take they heard, their word on it. */
export interface ReadingCasePrompt {
  itemId: string;
  /** The passage as the exercise holds it today. */
  text: string;
  /** The take the teacher heard, by media id; its `speech` variant is what the candidate hears. */
  assetId: string;
  seconds: number;
  /** The teacher's verdict on this prompt: what the machine's pass or fail is measured against. */
  approved: boolean;
}

/**
 * One reading aloud a teacher decided, as labelled data, as exercise-engine hands it out
 * (`GET /api/v1/internal/ai-review-cases?capability=voice_review`, plan 82 step 10a). No person
 * in it and none of the teacher's words. `caseId` is the attempt.
 */
export interface ReadingCase {
  caseId: string;
  decidedAt: string;
  /** The language learnt (`nb`) — what the candidate hears in, and the check's number words. */
  targetLanguage: string;
  /** The exercise's mark today (`review.readingPassPercent`). */
  passPercent: number;
  /** In the exercise's order. */
  prompts: ReadingCasePrompt[];
}

export interface ReadingCaseSet {
  cases: ReadingCase[];
  /** Decided readings the engine left out, by reason. */
  skipped: Record<string, number>;
}

/** The engine's reading check on one prompt (`POST /api/v1/internal/reading-checks`). */
export interface PromptCheck {
  itemId: string;
  /** Passage words read. */
  read: number;
  total: number;
  /** Whole percent, rounded down. */
  percent: number;
  passed: boolean;
}
