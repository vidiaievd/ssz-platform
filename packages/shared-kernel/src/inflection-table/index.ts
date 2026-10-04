export type { Paradigm, ParadigmPack, Slot } from './packs.js';
export { instructionFor, packById, packFor, PACKS } from './packs.js';

export type {
  Cell,
  CellMode,
  InflectionTableContent,
  InputMode,
  InputSettings,
  RevealKey,
  Row,
  Settings,
} from './model.js';
export {
  cellKey,
  DEFAULT_INPUT,
  DEFAULT_SETTINGS,
  emptyContent,
  IT_BANK_CROWDED,
  IT_FEW_ROWS,
  IT_MANY_ROWS,
  IT_MAX_ATTEMPTS,
  IT_MAX_BANK_EXTRA,
  IT_MAX_ROWS,
  IT_MIN_ATTEMPTS,
  IT_MIN_SLOTS,
  IT_MIN_THRESHOLD,
  maxChecks,
  newCell,
  newId,
  packOf,
  paradigmOf,
  parseCellKey,
  REVEAL_KEYS,
  slotsGone,
  slotsInPlay,
} from './model.js';

export type { NearMiss } from './compare.js';
export { cellOk, keysOf, nearMiss, norm } from './compare.js';

export type { AskedCell, CeilingCause, FormsCoverage } from './derive.js';
export {
  askedCells,
  ceilingCause,
  cellOf,
  firstLetter,
  formsCoverage,
  gradedCells,
  isLinked,
  readyRows,
} from './derive.js';

export type { DictionaryEntry } from './dictionary.js';
export { bare, entriesFor, fromDictionary, lemmaOf, suggestedForm } from './dictionary.js';

export { bankForms, distractors, distractorShortfall, inBank } from './bank.js';

export type { ParadigmSwitch } from './edits.js';
export {
  addAccept,
  addManualRow,
  addRow,
  bulkFirstGiven,
  bulkOpenAll,
  canAddRow,
  pickParadigm,
  previewParadigmSwitch,
  removeAccept,
  removeRow,
  setCellMode,
  setCellValue,
  setInstruction,
  setLemma,
  setTitle,
  setWhy,
  toggleSlot,
  updateInput,
  updateSettings,
} from './edits.js';

export type { Issue, IssueCode, IssueLevel, IssueStep, StepState, StepStatus } from './issues.js';
export { blockers, isReady, issues, stepState } from './issues.js';

export type { CellOutcome, CheckInput, CheckResult, RowOutcome } from './grading.js';
export { check } from './grading.js';

export type {
  PersistedAnswers,
  PersistedCell,
  PersistedContent,
  PersistedKey,
  PersistedRow,
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
  ProjectedCell,
  ProjectedRow,
  ProjectedSettings,
  ProjectedSlot,
  Shuffle,
  StudentProjection,
} from './projection.js';
export { toStudentProjection, withGradedSettings } from './projection.js';

export type { GradingCase } from './fixture.js';
export { ALL_RIGHT, GRADING_FIXTURE, sampleContent } from './fixture.js';
