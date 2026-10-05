// The shared grading fixture — one table, a handful of answers, the verdict each must get.
//
// Published, not test-support: the kernel's own test and the engine's validator test load the
// same cases (as `DIFF_FIXTURE` of plan 68), so a server that grades a cell differently from
// the builder's preview fails a test on one side or the other (IT-X6).
//
// The table is the handoff's IT_SAMPLE — `jobb / bok / hus / søster`, one weak masculine, one
// feminine with umlaut, one monosyllabic neuter and one syncopating stem — with fixed ids, the
// first column given and the twelve other cells asked.

import type { Cell, InflectionTableContent, Row } from './model.js';
import { DEFAULT_INPUT, DEFAULT_SETTINGS } from './model.js';

const SLOTS = ['indefSg', 'defSg', 'indefPl', 'defPl'] as const;

function row(
  id: string,
  lemma: string,
  gloss: string,
  forms: readonly string[],
  why: readonly string[],
  accept: Record<string, string[]> = {},
): Row {
  const cells: Record<string, Cell> = {};
  SLOTS.forEach((slotId, i) => {
    cells[slotId] = {
      mode: i === 0 ? 'prefill' : 'ask',
      value: forms[i] ?? '',
      accept: accept[slotId] ?? [],
      why: i === 0 ? '' : (why[i - 1] ?? ''),
    };
  });
  return { id, lemma, gloss, dictId: `dict-${id}`, cells };
}

/** The sample table, typing mode, two checks, pass mark 75 %. */
export function sampleContent(
  overrides: Partial<InflectionTableContent> = {},
): InflectionTableContent {
  return {
    title: 'Substantiv — hele bøyingen',
    instruction: 'Fyll ut bøyingen. Første kolonne er gitt.',
    language: 'nb',
    packId: 'nb-core',
    packVersion: '2.4',
    paradigmId: 'noun',
    slots: [...SLOTS],
    rows: [
      row(
        'r1',
        'en jobb',
        'job',
        ['jobb', 'jobben', 'jobber', 'jobbene'],
        [
          'Hankjønn: -en i bestemt entall.',
          'Hankjønn flerstavelse: -er i ubestemt flertall.',
          '…og -ene i bestemt flertall.',
        ],
      ),
      row(
        'r2',
        'ei bok',
        'book',
        ['bok', 'boka', 'bøker', 'bøkene'],
        [
          'Hunkjønn i bokmål: ei bok → boka.',
          'Omlyd i flertall: o → ø.',
          'Flertallsstammen bøk- beholdes: bøkene.',
        ],
        { defSg: ['boken'] },
      ),
      row(
        'r3',
        'et hus',
        'house',
        ['hus', 'huset', 'hus', 'husene'],
        [
          'Intetkjønn: -et i bestemt entall, huset.',
          'Intetkjønn, én stavelse: ingen endelse i ubestemt flertall.',
          'Endelsen -ene kommer likevel i bestemt flertall: husene.',
        ],
      ),
      row(
        'r4',
        'ei søster',
        'sister',
        ['søster', 'søstera', 'søstre', 'søstrene'],
        [
          'Hunkjønn: søstera. «Søsteren» finnes også og godtas.',
          'Søster mister e-en i stammen: søstre.',
          'Samme stamme videre: søstrene.',
        ],
        { defSg: ['søsteren'] },
      ),
    ],
    input: { ...DEFAULT_INPUT },
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  };
}

/** Every asked cell of the sample, right. */
export const ALL_RIGHT: Readonly<Record<string, string>> = {
  'r1:defSg': 'jobben',
  'r1:indefPl': 'jobber',
  'r1:defPl': 'jobbene',
  'r2:defSg': 'boka',
  'r2:indefPl': 'bøker',
  'r2:defPl': 'bøkene',
  'r3:defSg': 'huset',
  'r3:indefPl': 'hus',
  'r3:defPl': 'husene',
  'r4:defSg': 'søstera',
  'r4:indefPl': 'søstre',
  'r4:defPl': 'søstrene',
};

export interface GradingCase {
  name: string;
  input: 'type' | 'bank';
  answers: Readonly<Record<string, string>>;
  expect: {
    correct: number;
    falsePositives: number;
    pct: number;
    passed: boolean;
    /** Cells whose verdict the case is about: right or not, and the near miss of a wrong one. */
    cells: Readonly<Record<string, { ok: boolean; near?: 'diacritic' | 'ending' }>>;
  };
}

const replace = (changes: Record<string, string>): Record<string, string> => ({
  ...ALL_RIGHT,
  ...changes,
});

export const GRADING_FIXTURE: readonly GradingCase[] = [
  {
    name: 'every cell right',
    input: 'type',
    answers: ALL_RIGHT,
    expect: {
      correct: 12,
      falsePositives: 0,
      pct: 100,
      passed: true,
      cells: { 'r2:indefPl': { ok: true } },
    },
  },
  {
    name: 'case and spaces are forgiven, a variant is accepted in its own cell',
    input: 'type',
    answers: replace({ 'r1:defSg': '  Jobben ', 'r2:defSg': 'boken', 'r4:defSg': 'søsteren' }),
    expect: {
      correct: 12,
      falsePositives: 0,
      pct: 100,
      passed: true,
      cells: { 'r1:defSg': { ok: true }, 'r2:defSg': { ok: true }, 'r4:defSg': { ok: true } },
    },
  },
  {
    name: 'a diacritic never folds, and is named',
    input: 'type',
    answers: replace({ 'r2:indefPl': 'boker', 'r2:defPl': 'boekene' }),
    expect: {
      correct: 10,
      falsePositives: 0,
      pct: 83,
      passed: true,
      cells: {
        'r2:indefPl': { ok: false, near: 'diacritic' },
        'r2:defPl': { ok: false, near: 'diacritic' },
      },
    },
  },
  {
    name: 'right stem, wrong ending is named',
    input: 'type',
    answers: replace({ 'r1:defSg': 'jobba', 'r3:defSg': 'husa' }),
    expect: {
      correct: 10,
      falsePositives: 0,
      pct: 83,
      passed: true,
      cells: {
        'r1:defSg': { ok: false, near: 'ending' },
        'r3:defSg': { ok: false, near: 'ending' },
      },
    },
  },
  {
    name: 'an empty cell is wrong, and a wrong cell costs nothing extra in typing mode',
    input: 'type',
    answers: replace({ 'r1:defSg': '', 'r4:indefPl': 'søstere', 'r4:defPl': 'xyz' }),
    expect: {
      correct: 9,
      falsePositives: 0,
      pct: 75,
      passed: true,
      cells: {
        'r1:defSg': { ok: false },
        'r4:indefPl': { ok: false, near: 'ending' },
        'r4:defPl': { ok: false },
      },
    },
  },
  {
    name: 'under the pass mark',
    input: 'type',
    answers: replace({ 'r1:defSg': '', 'r1:indefPl': '', 'r1:defPl': '', 'r2:defSg': '' }),
    expect: {
      correct: 8,
      falsePositives: 0,
      pct: 67,
      passed: false,
      cells: { 'r2:defSg': { ok: false } },
    },
  },
  {
    name: 'bank: a form in the wrong cell costs a right one, an empty cell does not',
    input: 'bank',
    answers: replace({ 'r1:defSg': '', 'r2:defSg': 'bøkene' }),
    expect: {
      correct: 10,
      falsePositives: 1,
      pct: 75,
      passed: true,
      cells: { 'r1:defSg': { ok: false }, 'r2:defSg': { ok: false } },
    },
  },
  {
    name: 'bank: sweeping one form across the grid earns nothing',
    input: 'bank',
    answers: Object.fromEntries(Object.keys(ALL_RIGHT).map((key) => [key, 'husene'])),
    expect: {
      correct: 1,
      falsePositives: 11,
      pct: 0,
      passed: false,
      cells: { 'r3:defPl': { ok: true } },
    },
  },
];
