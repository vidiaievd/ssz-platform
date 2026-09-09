// Test fixtures. Not part of the published surface — `tsconfig.json` excludes
// `*.test-support.ts` from the build.
//
// Deliberately not `MG_SAMPLE` from the prototype: README lists the sample among the
// things not to port, and a fixture that reproduces the handoff's six-row Sykkellys table
// would make every test read as a check of that table rather than of the rule under test.
// These build the smallest document each rule needs.

import type { Column, MultipleChoiceGroupContent, Row, Settings } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

let counter = 0;
const id = (prefix: string): string => `${prefix}${(counter += 1)}`;

export function col(label: string, short?: string): Column {
  return { id: id('c'), label, short: short ?? label.slice(0, 1).toUpperCase() };
}

export function row(text: string, answer: string | null = null, extra: Partial<Row> = {}): Row {
  return { id: id('r'), text, answer, why: '', quote: '', ...extra };
}

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

/**
 * A valid two-column table with four answered, explained statements — the shape that
 * raises no blockers, so a test can break exactly one thing and assert exactly one issue.
 */
/**
 * The two columns `exercise()` builds on, with fixed ids.
 *
 * Fixed rather than generated so that rows taken from one `exercise()` call are still
 * answered inside another — `exercise({ rows: exercise().rows.map(...) })` is how most of
 * these tests break exactly one thing, and generated ids would make every such row an
 * orphan pointing at a column that no longer exists.
 */
export const RIGHT: Column = { id: 'col-right', label: 'Riktig', short: 'R' };
export const WRONG: Column = { id: 'col-wrong', label: 'Galt', short: 'G' };

export function exercise(
  overrides: Partial<MultipleChoiceGroupContent> = {},
): MultipleChoiceGroupContent {
  const right = RIGHT;
  const wrong = WRONG;

  return {
    title: 'Table',
    instruction: 'Read the text.',
    source: { mode: 'none', label: '', text: '' },
    columns: [right, wrong],
    rows: [
      row('Statement one.', right.id, { why: 'Because one.' }),
      row('Statement two.', wrong.id, { why: 'Because two.' }),
      row('Statement three.', right.id, { why: 'Because three.' }),
      row('Statement four.', wrong.id, { why: 'Because four.' }),
    ],
    settings: settings(),
    ...overrides,
  };
}

/** Issue codes only — what most assertions actually care about. */
export function codes(issues: ReadonlyArray<{ code: string }>): string[] {
  return issues.map((i) => i.code);
}
