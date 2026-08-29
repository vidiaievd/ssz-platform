// Plan 54 §3.5 — what reaches the browser before the student answers.

import { describe, expect, it } from 'vitest';

import { toStudentProjection } from './projection.js';
import { toContent, toExpectedAnswers } from './persistence.js';
import { shuffled } from './shuffle.js';
import { col, exercise, row, settings } from './fixtures.test-support.js';

const project = (ex: ReturnType<typeof exercise>, shuffle?: <T>(items: readonly T[]) => T[]) =>
  toStudentProjection(toContent(ex), toExpectedAnswers(ex), shuffle);

describe('what is withheld', () => {
  it('ships no answer and no explanation', () => {
    const base = exercise();
    const ex = exercise({ rows: base.rows.map((r) => ({ ...r, quote: 'a proving line' })) });
    const projected = project(ex);

    // The column ids travel — the runner has to send one back. No row may carry one.
    for (const r of projected.rows) {
      expect(Object.keys(r)).toEqual(['id', 'text']);
    }
    const serialised = JSON.stringify(projected);
    expect(serialised).not.toContain('Because one.');
    expect(serialised).not.toContain('a proving line');
  });

  it('ships no quote even when the passage it was cut from is shown', () => {
    // A real quote is a substring of the passage, so a string search cannot tell the two
    // apart — the assertion has to be that the rows carry no quote at all.
    const base = exercise();
    const ex = exercise({
      source: { mode: 'inline', label: 'T', text: 'A passage about lys.' },
      rows: base.rows.map((r) => ({ ...r, quote: 'about lys' })),
    });

    for (const row of project(ex).rows) expect(row).not.toHaveProperty('quote');
  });

  it('withholds lockCorrect and revealKey — they are the server’s to decide', () => {
    const projected = project(exercise());
    expect(projected.settings).not.toHaveProperty('lockCorrect');
    expect(projected.settings).not.toHaveProperty('revealKey');
  });

  it('carries retry and the pass mark, which reveal nothing', () => {
    const projected = project(exercise({ settings: settings({ retry: 'unlimited', passThreshold: 80 }) }));
    expect(projected.settings).toMatchObject({ retry: 'unlimited', passThreshold: 80 });
  });
});

describe('what is dropped', () => {
  it('leaves out rows with no text and rows with no key', () => {
    const right = col('Riktig');
    const ex = exercise({
      columns: [right, col('Galt')],
      rows: [row('shown', right.id), row('no key'), row('', right.id)],
    });
    expect(project(ex).rows.map((r) => r.text)).toEqual(['shown']);
  });

  it('answers an empty table when the key column is missing entirely', () => {
    expect(toStudentProjection(toContent(exercise()), {}).rows).toEqual([]);
  });
});

describe('the passage', () => {
  it('is sent inline when the author attached one and chose to show it', () => {
    const ex = exercise({ source: { mode: 'inline', label: 'Sykkellys', text: 'A passage.' } });
    expect(project(ex).source).toEqual({ mode: 'inline', label: 'Sykkellys', text: 'A passage.' });
  });

  it('is withheld rather than flagged when showText is off', () => {
    const ex = exercise({
      source: { mode: 'inline', label: 'Sykkellys', text: 'A passage.' },
      settings: settings({ showText: false }),
    });
    const projected = project(ex);
    expect(projected.source.text).toBeUndefined();
    expect(projected.settings.showText).toBe(false);
  });

  it('carries the lesson id in link mode', () => {
    const ex = exercise({ source: { mode: 'link', label: 'Tekst 1A', text: '', lessonId: 'les-1' } });
    expect(project(ex).source).toEqual({ mode: 'link', label: 'Tekst 1A', lessonId: 'les-1' });
  });
});

describe('ordering', () => {
  it('is author order when shuffleRows is off', () => {
    const ex = exercise();
    expect(project(ex, (items) => shuffled(items, 5)).rows.map((r) => r.text)).toEqual(
      ex.rows.map((r) => r.text),
    );
  });

  it('applies the injected shuffle when it is on', () => {
    const ex = exercise({ settings: settings({ shuffleRows: true }) });
    const first = project(ex, (items) => shuffled(items, 5)).rows.map((r) => r.id);
    const again = project(ex, (items) => shuffled(items, 5)).rows.map((r) => r.id);
    expect(first).toEqual(again);
    expect(first).not.toEqual(ex.rows.map((r) => r.id));
  });

  it('never shuffles the columns', () => {
    const ex = exercise({ settings: settings({ shuffleRows: true }) });
    const projected = project(ex, (items) => shuffled(items, 9));
    expect(projected.columns.map((c) => c.label)).toEqual(['Riktig', 'Galt']);
  });
});
