// `read_aloud` — speech recorded by the student and graded by a person (plan 70).

export type {
  AiVisibility,
  Criterion,
  CriterionWeight,
  FocusWord,
  Mode,
  ModeConfig,
  ModeModality,
  ModeNeeds,
  PlanPoint,
  Prompt,
  PromptImage,
  ReadAloudContent,
  Recording,
  RevisionPolicy,
  Review,
  Settings,
  ShowModelPolicy,
  ShowRubricPolicy,
  Turn,
} from './model.js';
export {
  AI_VISIBILITIES,
  DEFAULT_RECORDING,
  DEFAULT_REVIEW,
  DEFAULT_SETTINGS,
  defaultRubric,
  emptyContent,
  isMode,
  LEN,
  modeConfig,
  MODES,
  newCriterion,
  newId,
  newPrompt,
  RA_LONG_PLAN_POINTS,
  RA_LONG_TEXT_WORDS,
  RA_MANY_PROMPTS,
  RA_MAX_CRITERIA,
  RA_MAX_PREP_SECONDS,
  RA_MAX_PROMPTS,
  RA_MAX_TAKES,
  RA_MIN_CRITERIA,
  REVISIONS,
  SHOW_MODEL,
  SHOW_RUBRIC,
} from './model.js';

export {
  baseMime,
  bytesFor,
  formatSeconds,
  LIMITS,
  READING_WPM,
  readSeconds,
  RECORDING_MIME_TYPES,
  recordLimit,
  wordCount,
} from './limits.js';

export type { PassagePiece } from './derive.js';
export {
  focusAt,
  hasMaterial,
  hasNote,
  hasPicture,
  longestMax,
  passagePieces,
  planOf,
  rubricMax,
  withNoteCount,
  wordKey,
} from './derive.js';

export type { PromptOutcome, SpeakingCriterion, SpeakingOutcome, SpeakingSnapshot } from './rubric.js';
export {
  markKey,
  marksOf,
  parseMarkKey,
  readMarks,
  readSpeakingSnapshot,
  scorePrompts,
  simulatedMarks,
  snapshotOf,
} from './rubric.js';

export type {
  Notice,
  Phase,
  RecorderConfig,
  RecorderEvent,
  RecorderPrompt,
  RecorderState,
  SubmitBlock,
  Take,
  UploadState,
} from './recorder.js';
export {
  canSubmit,
  chosenIndex,
  chosenTake,
  CLOCK_WARN_SECONDS,
  clockSeconds,
  clockWarns,
  COUNTDOWN_SECONDS,
  initialState,
  isShort,
  left,
  MIC_LEVEL_THRESHOLD,
  MIC_OK_MS,
  MIC_SILENT_MS,
  micOk,
  micSilent,
  recordedCount,
  recordedShare,
  reduce,
  sentTakes,
  shortOnes,
  submitBlock,
  takesOf,
  ticking,
  uploadsPending,
} from './recorder.js';

export * from './edits.js';

export type { Issue, IssueCode, IssueContext, IssueLevel, IssueStep, MaterialNeed, StepState, StepStatus } from './issues.js';
export { blockers, isReady, issues, stepState } from './issues.js';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedCriterion,
  PersistedPrompt,
  PersistedPromptKey,
} from './persistence.js';
export { fromPersisted, readAnswers, readContent, TEMPLATE_CODE, toContent, toExpectedAnswers } from './persistence.js';

export type { ProjectedCriterion, ProjectedPrompt, StudentProjection } from './projection.js';
export { toStudentProjection } from './projection.js';

export type { Draft, DraftTake, Submission, SubmittedRecording, SubmittedTake } from './submission.js';
export { readDraft, readSubmission, toDraft, toSubmission, unsentAssets } from './submission.js';

export { SAMPLE_PROMPT_IDS, sampleDocument } from './fixture.js';
