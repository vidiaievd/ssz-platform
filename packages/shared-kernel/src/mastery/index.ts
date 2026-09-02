// The mastery profile's arithmetic — plan 55 §3.9. Pure; the projection is in analytics.

export type {
  EwmaOptions,
  MasteryCell,
  MasteryObservation,
  MasteryState,
} from './model.js';
export { cellsFor } from './model.js';

export type { WeightInput } from './weight.js';
export { evidenceWeight, failureWeight, succeededAt, successWeight } from './weight.js';

export { foldAttempt } from './ewma.js';

export type {
  CellProfile,
  CellVerdict,
  UncertainCell,
  WeakestCells,
  WeakestCellsOptions,
} from './verdict.js';
export { weakestCells } from './verdict.js';
