// AC-S11 and the storage split. The leak tests are structural: a key leaks as a field, and
// a search for the answer text could not tell `en` the bucket label from `en` the key.

import { describe, expect, it } from 'vitest';

import { setOverride, setUseNone, toggleAlso } from './edits.js';
import { fromPersisted, readContent, toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection } from './projection.js';
import { shuffled } from './shuffle.js';
import { EI, EN, exercise, item, settings } from './fixtures.test-support.js';

const persist = (ex = exercise()) => ({ content: toContent(ex), expected: toExpectedAnswers(ex) });

describe('persistence', () => {
  it('round-trips the authored document', () => {
    const ex = setOverride(toggleAlso(setUseNone(exercise(), true), 'i4', EN.id), 'i1', EI.id, 'x');
    const { content, expected } = persist(ex);
    expect(fromPersisted(content, expected)).toEqual(ex);
  });

  it('keeps the key out of the content column', () => {
    const { content } = persist(toggleAlso(exercise(), 'i4', EN.id));
    for (const i of content.items) expect(Object.keys(i).sort()).toEqual(['id', 'text']);
    expect(content).not.toHaveProperty('fb');
  });

  it('reads a malformed column without throwing', () => {
    expect(readContent(null).items).toEqual([]);
    expect(fromPersisted({ items: 'x', settings: { attempts: 7, threshold: 400 } }, 5).settings).toMatchObject({
      attempts: 0,
      threshold: 100,
    });
  });

  it('carries an item recording through', () => {
    const ex = exercise({ items: [item('i1', 'bil', EN.id, { mediaId: 'asset-1' })] });
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex)).items[0]?.mediaId).toBe('asset-1');
  });
});

describe('the student projection', () => {
  it('AC-S11: items are id and text, buckets id, label and a hint — nothing else', () => {
    const { content, expected } = persist(toggleAlso(exercise(), 'i4', EN.id));
    const p = toStudentProjection(content, expected);
    for (const i of p.items) expect(Object.keys(i).sort()).toEqual(['id', 'text']);
    for (const b of p.buckets) expect(Object.keys(b).sort()).toEqual(['hint', 'id', 'label']);
    expect(Object.keys(p).sort()).toEqual(['buckets', 'instruction', 'items', 'settings']);
    expect(Object.keys(p.settings).sort()).toEqual(['attempts', 'revealKey', 'showRemaining', 'threshold']);
  });

  it('the hint is the first clause of the rule, and only under hints', () => {
    const { content, expected } = persist();
    expect(toStudentProjection(content, expected).buckets[0]).toEqual({ id: EN.id, label: 'en', hint: 'Hankjønn' });

    const off = persist(exercise({ settings: settings({ hints: false }) }));
    expect(toStudentProjection(off.content, off.expected).buckets[0]).toEqual({ id: EN.id, label: 'en' });
  });

  it('drops unready items, and shows the refusal bucket last', () => {
    const ex = setUseNone(
      exercise({ items: [...exercise().items, item('i7', 'stol', null), item('i8', '', EN.id)] }),
      true,
    );
    const { content, expected } = persist(ex);
    const p = toStudentProjection(content, expected);
    expect(p.items.map((i) => i.id)).not.toContain('i7');
    expect(p.items.map((i) => i.id)).not.toContain('i8');
    expect(p.buckets.at(-1)).toEqual({ id: 'none', label: 'Ingen av delene' });
  });

  it('a caller without the key column gets an empty pool, not a leak', () => {
    expect(toStudentProjection(persist().content, {}).items).toEqual([]);
  });

  it('deals with the injected shuffle only when shuffle is on', () => {
    const { content, expected } = persist();
    const seeded = <T,>(xs: readonly T[]) => shuffled(xs, 42);
    const dealt = toStudentProjection(content, expected, seeded).items.map((i) => i.id);
    expect(dealt).toEqual(shuffled(['i1', 'i2', 'i3', 'i4', 'i5', 'i6'], 42));

    const off = persist(exercise({ settings: settings({ shuffle: false }) }));
    expect(toStudentProjection(off.content, off.expected, seeded).items.map((i) => i.id)).toEqual([
      'i1',
      'i2',
      'i3',
      'i4',
      'i5',
      'i6',
    ]);
  });
});
