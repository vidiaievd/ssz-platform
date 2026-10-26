/** One prompt to hear: the passage and the take the learner chose for it (engine, plan 82 step 6). */
export interface ReadAloudSubjectPrompt {
  itemId: string;
  label: string;
  /** The passage as the author wrote it — the reference text a pronunciation model scores against. */
  text: string;
  /** Words the author grades by ear; feedback only. */
  focus: string[];
  /** The recording, by media id; its `speech` variant is what a model hears. */
  assetId: string;
  seconds: number;
}

/** What exercise-engine gives a voice review to hear (`ai-review-subject?capability=voice_review`). */
export interface ReadAloudSubject {
  template: 'read_aloud';
  /** The language learnt (`nb`) — the language the model hears in. */
  targetLanguage: string;
  passPercent: number;
  /** `on` — the machine may check this reading at all; `checks` — what the author asked of it. */
  ai: { on: boolean; checks: { transcript: boolean; pronunciation: boolean; fluency: boolean } };
  /** The prompts recorded in this try, in the exercise's order. */
  prompts: ReadAloudSubjectPrompt[];
  /** Carried from a returned try; ruled then, not heard again. */
  carriedItemIds: string[];
}

/** What the engine answers about a submission under `voice_review`: a reading to hear, or why not. */
export interface VoiceSubjectResult {
  attemptId: string;
  userId: string;
  schoolId: string | null;
  templateCode: string;
  /** As for the text capabilities: `ATTEMPT_NOT_IN_REVIEW`, `DRAFT_EXISTS`, `TEMPLATE_NOT_SUPPORTED`, … */
  skip: string | null;
  subject: ReadAloudSubject | null;
}
