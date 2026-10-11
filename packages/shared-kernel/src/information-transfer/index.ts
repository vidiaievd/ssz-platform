// `information_transfer` — fill in a form from a text or a recording (plan 73).

export type {
  Answering,
  Attempts,
  Field,
  FieldType,
  Form,
  Grading,
  HintsAfter,
  InfFocus,
  InformationTransferContent,
  Layout,
  Memory,
  RevealKey,
  Scoring,
  ShowSource,
  SourceKind,
} from './model.js';
export {
  ATTEMPTS,
  DEFAULT_ANSWERING,
  DEFAULT_FORM,
  DEFAULT_GRADING,
  DEFAULT_SCORING,
  emptyAudio,
  emptyContent,
  FIELD_TYPES,
  FOCUSES,
  FORMAT_TYPES,
  HINTS_AFTER,
  isFormatType,
  isLexicalType,
  LAYOUTS,
  MAX_FIELDS,
  maxChecks,
  MEMORIES,
  MIN_FIELDS,
  newField,
  newId,
  REVEAL_KEYS,
  SHOW_SOURCES,
  SOURCE_KINDS,
} from './model.js';

export type { AcceptedTemplates, FormatPack, PackPlaceholders } from './packs/index.js';
export { packFor, PACKS, packsFor } from './packs/index.js';

export {
  canon,
  dateCandidates,
  moneyCandidates,
  normText,
  numberCandidates,
  phoneCandidates,
  timeCandidates,
  wordsToNumber,
} from './formats.js';

export {
  expectedOf,
  formatFields,
  inSource,
  packOf,
  readyFields,
  skillOf,
  sourceText,
  wordsIn,
} from './derive.js';

export type { CellGrade, CellOutcome, CheckInput, CheckResult, Verdict } from './grading.js';
export { check, gradeCell, keyPasses, passes, VERDICTS } from './grading.js';

export { acceptedForms, numberToWords } from './accepted.js';

export type { ScanHit } from './scan.js';
export { isAlreadyAField, scanSource } from './scan.js';

export {
  addField,
  moveField,
  removeExpected,
  removeField,
  setAnswering,
  setAudio,
  setExpected,
  setField,
  setFieldAudio,
  setFocus,
  setForm,
  setGrading,
  setInstruction,
  setLanguage,
  setPassage,
  setPassageTitle,
  setScoring,
  setSourceKind,
  setTitle,
} from './edits.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export {
  AUDIO_STEPS,
  audioIssuesOf,
  blockers,
  isReady,
  issues,
  placedAudioIssues,
  stepState,
} from './issues.js';

export {
  cellAtomsForMemory,
  practicedAtomsForMemory,
  ratesWords,
  SKILL_ATOM_TYPE,
  skillAtomId,
  skillAtoms,
} from './memory.js';

export type {
  PersistedAnswers,
  PersistedContent,
  PersistedField,
  PersistedKey,
} from './persistence.js';
export {
  fromPersisted,
  readAnswers,
  readContent,
  TEMPLATE_CODE,
  toContent,
  toExpectedAnswers,
} from './persistence.js';

export type { ProjectedField, StudentProjection } from './projection.js';
export { toStudentProjection, withGradedSettings } from './projection.js';

export {
  SAMPLE_ANSWERS,
  SAMPLE_FIELD_IDS,
  SAMPLE_PASSAGE,
  SAMPLE_TRANSCRIPT,
  sampleContent,
} from './fixture.js';
