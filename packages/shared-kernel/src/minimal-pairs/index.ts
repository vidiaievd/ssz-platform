// `minimal_pairs` — listening discrimination: one word of a pair is played, the student picks
// what they heard (plan 72).

export type {
  Clip,
  Feedback,
  GlossPolicy,
  MemoryPolicy,
  MinimalPairsContent,
  OptionsMode,
  Pair,
  PlaysPerProbe,
  ProbeSet,
  Provenance,
  Sampling,
  Scoring,
  Sittings,
  SpellingPolicy,
  Word,
} from './model.js';
export {
  CLIP_LIMITS,
  DEFAULT_FEEDBACK,
  DEFAULT_SCORING,
  DEFAULT_SET,
  emptyClip,
  emptyContent,
  FEW_PAIRS,
  formatMs,
  GLOSS_POLICIES,
  hasClip,
  MAX_GOOD_OPTIONS,
  MAX_PROBES,
  MAX_WORDS,
  MEMORY_POLICIES,
  MIN_PROBES,
  MIN_WORDS,
  newId,
  newPair,
  newWord,
  OPTIONS_MODES,
  PASS_PCT_HIGH,
  PLAYS_PER_PROBE,
  probeNumber,
  probeQuestionId,
  PROBES_INPUT_MAX,
  PROBES_INPUT_MIN,
  PROBES_METER_MAX,
  PROVENANCES,
  SAMPLINGS,
  SITTINGS,
  SPELLING_POLICIES,
} from './model.js';

export type { ContrastFamily, ContrastIcon, Dialect, LanguagePack, PackPlaceholders, TtsPolicy } from './packs/index.js';
export {
  contrastsOf,
  exerciseContrast,
  libraryOf,
  packFor,
  pairContrast,
  pairContrastId,
} from './packs/index.js';

export type { PlacedWord } from './derive.js';
export {
  allWords,
  contrastsInSet,
  estimatedMinutes,
  filledWords,
  findWord,
  isReadyPair,
  missingClips,
  neededToPass,
  optionWords,
  pairSpread,
  probePool,
  readyPairs,
  syntheticByContrast,
  syntheticCount,
  voicesOf,
  wordCount,
} from './derive.js';

export type { DealtProbe, DrawnProbe, History, Rand, WordHistory } from './sampler.js';
export { deal, historyKey, lcg, readDraw, sample } from './sampler.js';

export type { PairResult, PickRefusal, PickVerdict, ProbeRecord, ProbeState, Summary } from './judge.js';
export {
  firstCorrect,
  historyFrom,
  judgePick,
  maxTries,
  probeRecords,
  readProbeRecords,
  summarize,
} from './judge.js';

export { atomsForMemory, CONTRAST_ATOM_TYPE, contrastAtomId, contrastAtoms, ratesWords } from './memory.js';

export type { ProbeOption, ProbeReveal, ProbeView, RevealedOption } from './probe.js';
export { revealOf, toProbeView } from './probe.js';

export * from './edits.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export { blockers, isReady, issues, stepState } from './issues.js';

export type { PersistedAnswers, PersistedContent, PersistedPair } from './persistence.js';
export {
  fromPersisted,
  isMinimalPairsDocument,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type { StudentProjection } from './projection.js';
export { toStudentProjection, withGradedSettings } from './projection.js';

export { SAMPLE_PAIR_IDS, sampleDocument } from './fixture.js';
