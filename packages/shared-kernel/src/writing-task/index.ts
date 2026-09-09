export type {
  Ai,
  AiSelfLimit,
  AiVisibility,
  Criterion,
  CriterionMetric,
  Image,
  Letter,
  LetterRegister,
  Mode,
  ModeConfig,
  ModeNeeds,
  Point,
  RevisionPolicy,
  Settings,
  ShowModelPolicy,
  ShowRubricPolicy,
  WritingTask,
  WritingTaskContent,
} from './model.js';
export {
  DEFAULT_AI,
  DEFAULT_SETTINGS,
  defaultRubric,
  emptyContent,
  LEN_DEFAULTS,
  MODES,
  modeConfig,
  newPoint,
} from './model.js';

export type { Analysis, PointCoverage, TextLength } from './analysis.js';
export {
  analyse,
  hasPhrase,
  normalize,
  paragraphs,
  rubricMax,
  rubricScore,
  usablePoints,
  words,
} from './analysis.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export { blockers, isReady, issues, stepState, warnings } from './issues.js';

export type {
  RubricMarks,
  RubricOutcome,
  RubricSnapshot,
  SnapshotCriterion,
} from './verdict.js';
export {
  readRubricMarks,
  readRubricSnapshot,
  scoreRubric,
  snapshotRubric,
  toPercent,
} from './verdict.js';

export type {
  DocumentEnvelope,
  PersistedAnswers,
  PersistedContent,
  PersistedCriterion,
  PersistedPoint,
} from './persistence.js';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type {
  ProjectedCriterion,
  ProjectedPoint,
  ProjectedSettings,
  StudentProjection,
} from './projection.js';
export { toStudentProjection } from './projection.js';
