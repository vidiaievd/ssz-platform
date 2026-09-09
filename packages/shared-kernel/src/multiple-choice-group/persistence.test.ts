// Plan 54 §3.2 / §5 deviation 1 — the split across the two storage columns, and the
// coercion boundary.

import { describe, expect, it } from 'vitest';

import {
  fromPersisted,
  isMultipleChoiceGroupDocument,
  readAnswers,
  readContent,
  toContent,
  toExpectedAnswers,
} from './persistence.js';
import { DEFAULT_SETTINGS } from './model.js';
import { exercise, row, settings } from './fixtures.test-support.js';

describe('the content column', () => {
  it('carries no answer, no explanation and no quote', () => {
    const base = exercise();
    const ex = exercise({
      rows: base.rows.map((r) => ({ ...r, quote: 'a line from the text' })),
    });
    const content = toContent(ex);

    // The column ids are in there, and must be — the runner sends one back. What must not
    // be is any row pointing at one, so the assertion is structural rather than a search.
    for (const r of content.rows) {
      expect(r).not.toHaveProperty('answer');
      expect(r).not.toHaveProperty('why');
      expect(r).not.toHaveProperty('quote');
    }
    const serialised = JSON.stringify(content);
    expect(serialised).not.toContain('Because one.');
    expect(serialised).not.toContain('a line from the text');
  });

  it('keeps the statements, the columns and the settings', () => {
    const content = toContent(exercise());
    expect(content.rows.map((r) => r.text)).toEqual([
      'Statement one.',
      'Statement two.',
      'Statement three.',
      'Statement four.',
    ]);
    expect(content.columns.map((c) => c.label)).toEqual(['Riktig', 'Galt']);
    expect(content.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('persists empty rows as authored — a half-written table must survive a save', () => {
    const ex = exercise({ rows: [...exercise().rows, row('')] });
    expect(toContent(ex).rows).toHaveLength(5);
  });
});

describe('the answer column', () => {
  it('is keyed by row id, so reordering cannot shuffle it', () => {
    const ex = exercise();
    const answers = toExpectedAnswers(ex);
    expect(Object.keys(answers.rows)).toEqual(ex.rows.map((r) => r.id));
    expect(answers.rows[ex.rows[0]!.id]).toEqual({
      answer: ex.columns[0]!.id,
      why: 'Because one.',
      quote: '',
    });
  });
});

describe('round trip', () => {
  it('rebuilds the document it was written from', () => {
    const ex = exercise({
      source: { mode: 'inline', label: 'Text', text: 'A passage.' },
      settings: settings({ retry: 'unlimited', passThreshold: 100 }),
    });
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });

  it('carries a link source with its lesson', () => {
    const ex = exercise({ source: { mode: 'link', label: 'Tekst 1A', text: '', lessonId: 'les-1' } });
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex)).source.lessonId).toBe('les-1');
  });
});

describe('the coercion boundary', () => {
  it('does not throw on nonsense', () => {
    expect(() => fromPersisted(null, undefined)).not.toThrow();
    expect(() => fromPersisted('a string', 42)).not.toThrow();
    expect(fromPersisted({}, {}).rows).toEqual([]);
  });

  it('fills settings defaults field by field', () => {
    const read = readContent({ settings: { retry: 'unlimited', layout: 'nonsense' } });
    expect(read.settings.retry).toBe('unlimited');
    expect(read.settings.layout).toBe(DEFAULT_SETTINGS.layout);
    expect(read.settings.numbering).toBe(DEFAULT_SETTINGS.numbering);
  });

  it('clamps a pass threshold outside 0-100 rather than silently defaulting it', () => {
    expect(readContent({ settings: { passThreshold: 140 } }).settings.passThreshold).toBe(100);
    expect(readContent({ settings: { passThreshold: -5 } }).settings.passThreshold).toBe(0);
    expect(readContent({ settings: { passThreshold: 'high' } }).settings.passThreshold).toBe(70);
  });

  it('derives a missing short code from the label', () => {
    expect(readContent({ columns: [{ id: 'c1', label: 'Galt' }] }).columns[0]!.short).toBe('G');
  });

  it('reads an empty answer string as no answer', () => {
    expect(readAnswers({ rows: { r1: { answer: '' } } }).rows['r1']!.answer).toBeNull();
  });

  it('leaves a row unanswered when the key column has no entry for it', () => {
    const doc = fromPersisted({ rows: [{ id: 'r1', text: 'a' }] }, { rows: {} });
    expect(doc.rows[0]).toMatchObject({ text: 'a', answer: null, why: '', quote: '' });
  });
});

describe('isMultipleChoiceGroupDocument', () => {
  it('recognises the new form, empty rows and all', () => {
    expect(isMultipleChoiceGroupDocument({ rows: [] })).toBe(true);
    expect(isMultipleChoiceGroupDocument(toContent(exercise()))).toBe(true);
  });

  it('rejects the old form and anything else', () => {
    // The shape of the two seeded exercises: `items[]`, not `rows[]`.
    expect(isMultipleChoiceGroupDocument({ items: [{ id: '1', question: 'a' }] })).toBe(false);
    expect(isMultipleChoiceGroupDocument({ rows: 'not an array' })).toBe(false);
    expect(isMultipleChoiceGroupDocument(null)).toBe(false);
  });
});
