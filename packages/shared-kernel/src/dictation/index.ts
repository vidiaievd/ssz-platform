export type { DcToken } from './tokens.js';
export { tokens, wordCount } from './tokens.js';

export type {
  Attempts,
  DictationContent,
  FocusOrphan,
  FocusWord,
  Marking,
  Mode,
  Near,
  Segment,
  Settings,
} from './model.js';
export {
  ATTEMPTS,
  DC_CHECK_INTERVAL_MS,
  DC_CLIP_LONG,
  DC_MAX_SEG,
  DC_ONE_PLAY_CROWDED,
  DC_SEG_LONG,
  DC_SEG_SHORT,
  DEFAULT_AUDIO,
  DEFAULT_MARKING,
  DEFAULT_SETTINGS,
  emptyContent,
  maxChecks,
  MODES,
  NEARS,
  newId,
  newSegment,
  passMark,
} from './model.js';

export type { DemoRewrite, LanguagePack } from './presets.js';
export { EMPTY_PACK, instructionFor, packFor, packOf, PACKS } from './presets.js';

export type { ErrorClass } from './classify.js';
export { acceptSpellings, classify, compareKey, ERROR_CLASSES, NEARABLE } from './classify.js';

export type { DelOp, DiffOp, DiffResult, EqOp, InsOp, SubOp, WordCounts } from './diff.js';
export { diff, passes } from './diff.js';

export type { CeilingCause } from './derive.js';
export {
  allWords,
  ceilingCause,
  focusAt,
  focusCoverage,
  isTimed,
  readySegments,
  timedCount,
} from './derive.js';

export type { SplitResult } from './split.js';
export { sentencesOf, splitTranscript } from './split.js';

export type { ReanchorResult } from './reanchor.js';
export { previewReanchor, putBackIndex, reanchorFocus } from './reanchor.js';

export type { JoinPreview } from './edits.js';
export {
  addSegment,
  applySplit,
  canAddSegment,
  canPutBack,
  dropOrphan,
  previewJoin,
  putBack,
  removeSegment,
  setFocusWhy,
  setMode,
  setSegmentAudio,
  setSegmentText,
  setSegmentWhy,
  toggleFocus,
  update,
  updateMarking,
  updateSettings,
} from './edits.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export {
  audioIssuesOf,
  audioItems,
  blockers,
  isReady,
  issues,
  keepsAudioIssue,
  SILENCED_AUDIO_CODES,
  stepState,
  warnings,
} from './issues.js';

export type {
  CheckInput,
  CheckOutcome,
  CheckRefusal,
  CheckResult,
  FirstCheck,
  FocusMiss,
  KeyFocus,
  SegmentState,
  VerdictOp,
} from './grading.js';
export { check, focusMisses, gradeSegment, readSegmentStates } from './grading.js';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedSegment,
} from './persistence.js';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type { ProjectedSegment, ProjectedSettings, StudentProjection } from './projection.js';
export { toStudentProjection, withGradedSettings } from './projection.js';

export { demoAnswer } from './demo.js';

export type { DiffCase } from './fixture.js';
export { DIFF_FIXTURE, opSignature } from './fixture.js';
