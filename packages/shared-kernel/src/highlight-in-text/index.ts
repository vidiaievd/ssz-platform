export type { Token } from './tokenize.js';
export { tokenize, TOKENIZER_ID, wordsOf } from './tokenize.js';
export { TOKENIZER_FIXTURE } from './tokenizer-fixture.js';

export type {
  Attempts,
  HighlightInTextContent,
  Orphan,
  Penalty,
  Question,
  Settings,
  Span,
  Unit,
} from './model.js';
export {
  ATTEMPTS,
  DEFAULT_SETTINGS,
  emptyContent,
  HT_DENSITY_HIGH,
  HT_FEW_SPANS,
  HT_MAX_Q,
  HT_TEXT_LONG,
  HT_TEXT_SHORT,
  maxChecks,
  newId,
  newQuestion,
  passMark,
  PENALTIES,
  PENALTY_WEIGHT,
  UNITS,
} from './model.js';

export type { CharRange, SnapResult, TokenRun } from './coordinates.js';
export {
  clampToParagraph,
  isOnTokens,
  mergeRuns,
  paragraphOfTokens,
  snapMarks,
  toCharRange,
  toTokenRun,
} from './coordinates.js';

export type { CeilingCause, Coverage, SpanRun } from './derive.js';
export {
  ceilingCause,
  coverage,
  density,
  markedWords,
  normalize,
  overlaps,
  readyQuestions,
  runsOfWords,
  spanOrdinals,
  spanRuns,
  surface,
  tokensOf,
  wordCount,
} from './derive.js';

export type { ReanchorPreview } from './reanchor.js';
export { canPutBack, dropOrphan, previewReanchor, putBack, reanchor } from './reanchor.js';

export type { MarkEdit } from './edits.js';
export {
  addQuestion,
  applyText,
  canAddQuestion,
  clearMarks,
  removeQuestion,
  removeSpan,
  resizeMark,
  setSpanWhy,
  setUnit,
  toggleMark,
  update,
  updateQuestion,
  updateSettings,
} from './edits.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export { blockers, isReady, issues, stepState, warnings } from './issues.js';

export type {
  Cell,
  CellState,
  CheckInput,
  CheckOutcome,
  CheckRefusal,
  CheckResult,
  GradeResult,
  KeySpan,
  QuestionState,
} from './grading.js';
export { check, grade, readQuestionStates } from './grading.js';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedQuestion,
} from './persistence.js';
export {
  fromPersisted,
  readAnswers,
  readContent,
  spanCounts,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type { ProjectedQuestion, ProjectedSettings, StudentProjection } from './projection.js';
export { toStudentProjection, withGradedSettings } from './projection.js';

export type { LanguagePack } from './presets.js';
export { instructionFor, packFor, PACKS } from './presets.js';
