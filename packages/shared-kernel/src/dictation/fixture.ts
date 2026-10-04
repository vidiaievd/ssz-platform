// The word-diff fixture both sides are tested against — AC-M1.
//
// Published with the module (not a `*.test-support.ts`) because the engine's suite imports the
// kernel from `dist`: the server runs the same cases through the same function as the
// client, and a change to either the diff or the fixture fails both. Every case is pinned to
// the criterion it proves; `ops` is written compactly by `opSignature` below.
//
// The language is `nb` throughout: the fold table of that pack is what makes `paa` and
// `horte` diacritic errors.

import type { DiffOp, WordCounts } from './diff.js';
import type { Marking } from './model.js';

export interface DiffCase {
  name: string;
  language: string;
  expected: string;
  typed: string;
  /** Over `DEFAULT_MARKING`. */
  marking: Partial<Marking>;
  focus: number[];
  ops: string[];
  words: WordCounts;
  /** The score's numerator doubled — see `DiffResult.num2`. */
  num2: number;
}

/**
 * One op as one short string: `=word` exact, `-word` missing, `+word` extra,
 * `~wrote>expected:class` substituted; `!` near, `*` on a focus word.
 */
export function opSignature(op: DiffOp): string {
  if (op.k === 'eq') return `=${op.w}`;
  if (op.k === 'del') return `-${op.expected}${op.focus ? '*' : ''}`;
  if (op.k === 'ins') return `+${op.wrote}`;
  return `~${op.wrote}>${op.expected}:${op.cls}${op.near ? '!' : ''}${op.focus ? '*' : ''}`;
}

export const DIFF_FIXTURE: readonly DiffCase[] = [
  {
    name: 'the handoff sample: kj/skj, å as aa, a dropped double consonant',
    language: 'nb',
    expected: 'På kjøkkenet står det en skje ved siden av tallerkenen.',
    typed: 'paa sjøkkenet står det en sje ved siden av talerkenen',
    marking: {},
    focus: [1, 5],
    ops: [
      '~paa>På:diacritic',
      '~sjøkkenet>kjøkkenet:typo*',
      '=står',
      '=det',
      '=en',
      '~sje>skje:typo*',
      '=ved',
      '=siden',
      '=av',
      '~talerkenen>tallerkenen:typo!',
    ],
    words: { total: 10, exact: 6, near: 1, wrong: 3, missing: 0, extra: 0 },
    num2: 12,
  },
  {
    name: 'AC-M2: capitals off — på for På is exact',
    language: 'nb',
    expected: 'På kjøkkenet står det.',
    typed: 'på kjøkkenet står det',
    marking: {},
    focus: [],
    ops: ['=på', '=kjøkkenet', '=står', '=det'],
    words: { total: 4, exact: 4, near: 0, wrong: 0, missing: 0, extra: 0 },
    num2: 8,
  },
  {
    name: 'AC-M3: capitals on — a case deviation, near under flag',
    language: 'nb',
    expected: 'På kjøkkenet står det.',
    typed: 'på kjøkkenet står det',
    marking: { caseSensitive: true },
    focus: [],
    ops: ['~på>På:case!', '=kjøkkenet', '=står', '=det'],
    words: { total: 4, exact: 3, near: 1, wrong: 0, missing: 0, extra: 0 },
    num2: 6,
  },
  {
    name: 'AC-M4: paa for På is a diacritic, never near, even under half',
    language: 'nb',
    expected: 'På kjøkkenet står det.',
    typed: 'paa kjøkkenet står det',
    marking: { caseSensitive: true, near: 'half' },
    focus: [],
    ops: ['~paa>På:diacritic', '=kjøkkenet', '=står', '=det'],
    words: { total: 4, exact: 3, near: 0, wrong: 1, missing: 0, extra: 0 },
    num2: 6,
  },
  {
    name: 'AC-M5: punctuation off — a missing comma is nothing',
    language: 'nb',
    expected: 'Hun sa at hun, ville komme.',
    typed: 'Hun sa at hun ville komme',
    marking: {},
    focus: [],
    ops: ['=Hun', '=sa', '=at', '=hun', '=ville', '=komme'],
    words: { total: 6, exact: 6, near: 0, wrong: 0, missing: 0, extra: 0 },
    num2: 12,
  },
  {
    name: 'punctuation on — a missing comma costs the word it hangs on',
    language: 'nb',
    expected: 'Hun sa at hun, ville komme.',
    typed: 'Hun sa at hun ville komme.',
    marking: { punctuation: true },
    focus: [],
    ops: ['=Hun', '=sa', '=at', '~hun>hun:punctuation!', '=ville', '=komme'],
    words: { total: 6, exact: 5, near: 1, wrong: 0, missing: 0, extra: 0 },
    num2: 10,
  },
  {
    name: 'punctuation on, capitals off — a comma, not a capital',
    language: 'nb',
    expected: 'Hun sa: Hei.',
    typed: 'hun sa hei.',
    marking: { punctuation: true },
    focus: [],
    ops: ['=hun', '~sa>sa:punctuation!', '=hei'],
    words: { total: 3, exact: 2, near: 1, wrong: 0, missing: 0, extra: 0 },
    num2: 4,
  },
  {
    name: 'AC-M6: igår for i går is one boundary deviation',
    language: 'nb',
    expected: 'Vi hørte det i går kveld.',
    typed: 'Vi hørte det igår kveld.',
    marking: {},
    focus: [4],
    ops: ['=Vi', '=hørte', '=det', '~igår>i går:boundary*', '=kveld'],
    words: { total: 6, exact: 4, near: 0, wrong: 1, missing: 0, extra: 0 },
    num2: 8,
  },
  {
    name: 'boundary the other way: ingen ting for ingenting',
    language: 'nb',
    expected: 'Han sa ingenting.',
    typed: 'Han sa ingen ting.',
    marking: {},
    focus: [],
    ops: ['=Han', '=sa', '~ingen ting>ingenting:boundary'],
    words: { total: 3, exact: 2, near: 0, wrong: 1, missing: 0, extra: 0 },
    num2: 4,
  },
  {
    name: 'AC-M7: a focus word one letter off is not near',
    language: 'nb',
    expected: 'På kjøkkenet står det.',
    typed: 'På sjøkkenet står det.',
    marking: {},
    focus: [1],
    ops: ['=På', '~sjøkkenet>kjøkkenet:typo*', '=står', '=det'],
    words: { total: 4, exact: 3, near: 0, wrong: 1, missing: 0, extra: 0 },
    num2: 6,
  },
  {
    name: 'AC-M8: one near miss in ten words under half scores 95%',
    language: 'nb',
    expected: 'en to tre fire fem seks sju åtte ni tallerken',
    typed: 'en to tre fire fem seks sju åtte ni talerken',
    marking: { near: 'half' },
    focus: [],
    ops: [
      '=en',
      '=to',
      '=tre',
      '=fire',
      '=fem',
      '=seks',
      '=sju',
      '=åtte',
      '=ni',
      '~talerken>tallerken:typo!',
    ],
    words: { total: 10, exact: 9, near: 1, wrong: 0, missing: 0, extra: 0 },
    num2: 19,
  },
  {
    name: 'AC-M9: a word not in the recording costs one word',
    language: 'nb',
    expected: 'Vi hadde ikke hørt noe.',
    typed: 'Vi hadde ikke hørt noe mer.',
    marking: {},
    focus: [],
    ops: ['=Vi', '=hadde', '=ikke', '=hørt', '=noe', '+mer'],
    words: { total: 5, exact: 5, near: 0, wrong: 0, missing: 0, extra: 1 },
    num2: 8,
  },
  {
    name: 'AC-M10: an empty answer scores 0 with every word missing',
    language: 'nb',
    expected: 'Vi hadde ikke hørt noe.',
    typed: '',
    marking: {},
    focus: [],
    ops: ['-Vi', '-hadde', '-ikke', '-hørt', '-noe'],
    words: { total: 5, exact: 0, near: 0, wrong: 0, missing: 5, extra: 0 },
    num2: 0,
  },
  {
    name: 'AC-M11: whitespace is never an error',
    language: 'nb',
    expected: 'Vi hadde ikke hørt noe.',
    typed: '  Vi  hadde\nikke hørt noe.  ',
    marking: {},
    focus: [],
    ops: ['=Vi', '=hadde', '=ikke', '=hørt', '=noe'],
    words: { total: 5, exact: 5, near: 0, wrong: 0, missing: 0, extra: 0 },
    num2: 10,
  },
  {
    name: 'ø written as o is a diacritic, not a typo',
    language: 'nb',
    expected: 'Vi hørte det.',
    typed: 'Vi horte det.',
    marking: { near: 'half' },
    focus: [],
    ops: ['=Vi', '~horte>hørte:diacritic', '=det'],
    words: { total: 3, exact: 2, near: 0, wrong: 1, missing: 0, extra: 0 },
    num2: 4,
  },
  {
    name: 'strict: a one-letter slip is wrong',
    language: 'nb',
    expected: 'Vi hadde ikke hørt.',
    typed: 'Vi hade ikke hørt.',
    marking: { near: 'strict' },
    focus: [],
    ops: ['=Vi', '~hade>hadde:typo', '=ikke', '=hørt'],
    words: { total: 4, exact: 3, near: 0, wrong: 1, missing: 0, extra: 0 },
    num2: 6,
  },
  {
    name: 'a missing focus word is a focus miss',
    language: 'nb',
    expected: 'Hytta ligger ved vannet.',
    typed: 'ligger ved vannet.',
    marking: {},
    focus: [0],
    ops: ['-Hytta*', '=ligger', '=ved', '=vannet'],
    words: { total: 4, exact: 3, near: 0, wrong: 0, missing: 1, extra: 0 },
    num2: 6,
  },
];
