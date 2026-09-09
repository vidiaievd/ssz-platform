export type {
  KindConfig,
  Layout,
  MultipleChoiceContent,
  Option,
  Question,
  QuestionKind,
  RetryPolicy,
  Settings,
} from './model.js';
export {
  DEFAULT_SETTINGS,
  duplicateQuestion,
  emptyContent,
  KINDS,
  kindConfig,
  maxAttempts,
  newOption,
  newQuestion,
} from './model.js';

export { answerableQuestions, correctOption, filledOptions, isAnswerable, setKey } from './derive.js';

export { identityShuffle, ordered, shuffled } from './shuffle.js';

export type { LanguagePack } from './language.js';
export { normalizeText, packFor, PACKS } from './language.js';

export type { Coverage, Issue, IssueCode, IssueLevel, IssueOptions, IssueStep, StepState, StepStatus } from './issues.js';
export { audit, blockers, coverage, isReady, issues, stepState, warnings } from './issues.js';

export type {
  AnswerInput,
  AnswerVerdict,
  AttemptResult,
  QuestionOutcome,
  SubmittedAnswer,
} from './grading.js';
export { eliminate, gradeAttempt, judge } from './grading.js';

export { parseBulk } from './bulk.js';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedKey,
  PersistedOption,
  PersistedQuestion,
} from './persistence.js';
export {
  fromPersisted,
  isMultipleChoiceDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type {
  ProjectedOption,
  ProjectedQuestion,
  ProjectedSettings,
  Shuffle,
  StudentProjection,
} from './projection.js';
export { projectSettings, toStudentProjection } from './projection.js';
