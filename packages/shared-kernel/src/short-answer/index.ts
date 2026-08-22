export type {
  KeyElement,
  KindConfig,
  PassRule,
  Question,
  QuestionKind,
  Settings,
  ShortAnswerContent,
  ShowModelPolicy,
  TeacherReviewPolicy,
} from './model.js';
export { DEFAULT_SETTINGS, emptyContent, kindConfig, KINDS, newElement, newQuestion } from './model.js';

export { hasAnchor, levenshtein, normalize, wordEquals, words } from './matching.js';

export type {
  AttemptOutcome,
  Coverage,
  ElementHit,
  GradedAnswer,
  QuestionResult,
  SubmittedAnswer,
  Verdict,
} from './grading.js';
export {
  coverage,
  grade,
  gradeAttempt,
  gradeableQuestions,
  modelPasses,
  usableElements,
} from './grading.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export { audit, blockers, isReady, issues, stepState, warnings } from './issues.js';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedQuestion,
} from './persistence.js';
export {
  fromPersisted,
  isShortAnswerDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type {
  GradedQuestion,
  ProjectedHit,
  ProjectedQuestion,
  ProjectedSettings,
  StudentProjection,
  StudentResult,
} from './projection.js';
export { toStudentProjection, toStudentResult } from './projection.js';
