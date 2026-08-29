// README §"Data model" — defaults, presets, factories and the attempt budget.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  emptyContent,
  maxAttempts,
  newColumn,
  newRow,
  passMark,
  PRESETS,
  shortFor,
} from './model.js';
import { settings } from './fixtures.test-support.js';

describe('defaults', () => {
  it('matches MG_DEFAULT_SETTINGS from the handoff', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      numbering: true,
      shuffleRows: false,
      layout: 'auto',
      showText: true,
      retry: 'one',
      lockCorrect: true,
      showWhy: 'wrong',
      revealKey: true,
      passThreshold: 70,
      progress: true,
    });
  });

  it('starts a document with the Riktig/Galt pair and four empty rows', () => {
    const ex = emptyContent();
    expect(ex.columns.map((c) => c.label)).toEqual(['Riktig', 'Galt']);
    expect(ex.rows).toHaveLength(4);
    expect(ex.rows.every((r) => r.text === '' && r.answer === null)).toBe(true);
    expect(ex.source.mode).toBe('none');
  });

  it('leaves the instruction empty rather than seeding Norwegian prose', () => {
    // Plan 53 §3.6, carried: the kernel serves four locales, so the builder's scaffold
    // fills this from the author's own.
    expect(emptyContent().instruction).toBe('');
  });

  it('gives every new document fresh ids', () => {
    const a = emptyContent();
    const b = emptyContent();
    expect(a.columns[0]!.id).not.toBe(b.columns[0]!.id);
    expect(a.rows[0]!.id).not.toBe(b.rows[0]!.id);
  });
});

describe('presets', () => {
  it('offers the four sets from the handoff', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['rg', 'rgs', 'jn', 'su']);
    expect(PRESETS[1]!.columns.map(([label]) => label)).toEqual([
      'Riktig',
      'Galt',
      'Står ikke i teksten',
    ]);
  });
});

describe('shortFor', () => {
  it('takes the first character, upper-cased', () => {
    expect(shortFor('Riktig')).toBe('R');
    expect(shortFor('  står ikke ')).toBe('S');
  });

  it('answers empty for an empty label rather than throwing', () => {
    expect(shortFor('   ')).toBe('');
  });
});

describe('factories', () => {
  it('derives a short code when none is given', () => {
    expect(newColumn('Galt').short).toBe('G');
    expect(newColumn('Galt', 'XX').short).toBe('XX');
  });

  it('makes an unanswered, unexplained row', () => {
    expect(newRow()).toMatchObject({ text: '', answer: null, why: '', quote: '' });
  });
});

describe('maxAttempts', () => {
  it('is the README budget: 1, 2, 99', () => {
    expect(maxAttempts(settings({ retry: 'none' }))).toBe(1);
    expect(maxAttempts(settings({ retry: 'one' }))).toBe(2);
    expect(maxAttempts(settings({ retry: 'unlimited' }))).toBe(99);
  });
});

describe('passMark', () => {
  it('rounds up — 70% of 6 rows is 5, not 4.2', () => {
    expect(passMark(settings({ passThreshold: 70 }), 6)).toBe(5);
  });

  it('is every row at 100%', () => {
    expect(passMark(settings({ passThreshold: 100 }), 4)).toBe(4);
  });

  it('is zero on an empty table', () => {
    expect(passMark(settings(), 0)).toBe(0);
  });
});
