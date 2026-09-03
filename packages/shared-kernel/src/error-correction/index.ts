export type {
  Ai,
  AiVisibility,
  AlignOp,
  Alignment,
  AttemptsPolicy,
  Check,
  Coverage,
  ErrorCorrection,
  ErrorCorrectionTask,
  Flow,
  Hints,
  Item,
  Judgement,
  Mode,
  Routing,
  ShowRefsPolicy,
  Span,
  SpanKey,
  SpanOutcome,
  SpanOverride,
  SpanState,
  SpanType,
  StrayEdit,
  StrayPolicy,
  StudentEdits,
  Verdict,
} from './model.js';
export {
  DEFAULT_AI,
  DEFAULT_CHECK,
  DEFAULT_FLOW,
  DEFAULT_HINTS,
  EMPTY_EDITS,
  FUNCTION_WORDS,
  SPAN_TYPES,
} from './model.js';

export {
  align,
  authoredItems,
  bare,
  build,
  coverage,
  edited,
  expandRef,
  hardSpans,
  hasRef,
  inferType,
  inserted,
  judge,
  norm,
  route,
  spanKey,
  spanState,
  spans,
  touched,
  typoEq,
  variants,
  wordEq,
  words,
} from './engine.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState } from './issues.js';
export { blockers, isReady, issues, stepState, transcriptGivesAway, warnings } from './issues.js';

export type {
  DocumentEnvelope,
  PersistedAnswerItem,
  PersistedAnswers,
  PersistedContent,
  PersistedItem,
} from './persistence.js';
export {
  fromPersisted,
  readAnswers,
  readContent,
  readEdits,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type {
  ProjectedFlow,
  ProjectedItem,
  SelfCheckFeedback,
  SelfCheckItem,
  StudentProjection,
} from './projection.js';
export { selfCheckFeedback, toStudentProjection } from './projection.js';
