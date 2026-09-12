// The language the analytics surfaces share — plan 58. Pure; the projections are in
// analytics-service and the drawing is in the web client.

export type { CellState, CellStateInput } from './model.js';
export { CELL_STATES, LOW_THRESHOLD, cellStateOf, isMeasured } from './model.js';

export type { Distribution, PositionBand } from './scale.js';
export { bandOf, distributionOf, pct, percentileOf } from './scale.js';
