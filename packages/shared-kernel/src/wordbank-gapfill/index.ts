export type {
  BankWord,
  Coverage,
  FeedbackOrigin,
  Gap,
  GapFeedback,
  GapKey,
  GapResult,
  InputMode,
  PairFeedback,
  Placement,
  Sentence,
  Settings,
  WordBankGapFill,
} from './model.js';
export { DEFAULT_SETTINGS } from './model.js';

export {
  answers,
  bank,
  core,
  coverage,
  EMPTY_FEEDBACK,
  equals,
  feedbackFor,
  gapKey,
  gaps,
  grade,
  pruneFeedback,
  tokens,
  withSentenceText,
} from './selectors.js';
