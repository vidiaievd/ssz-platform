export type {
  Coverage,
  Distractor,
  FeedbackOrigin,
  MatchPairs,
  MatchTask,
  Override,
  Pair,
  PairFeedback,
  PairId,
  PairResult,
  Placement,
  RightId,
  RightItem,
  Settings,
  Variant,
} from './model.js';
export { DEFAULT_SETTINGS } from './model.js';

export type { DocumentEnvelope, PersistedAnswers, PersistedContent } from './persistence.js';
export {
  fromPersisted,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type {
  ProjectedItem,
  ProjectedSlot,
  ProjectionOptions,
  StudentProjection,
} from './projection.js';
export { toStudentProjection } from './projection.js';

export type { Issue, IssueCode, IssueLevel, IssueStep } from './issues.js';
export { blockers, defaultExplanationLevel, isReady, issues, stepState, warnings } from './issues.js';

export {
  completePairs,
  coverage,
  EMPTY_FEEDBACK,
  explanationFor,
  feedbackFor,
  grade,
  isSolved,
  norm,
  pruneFeedback,
  rightItems,
  shuffled,
  wrongItems,
} from './selectors.js';
