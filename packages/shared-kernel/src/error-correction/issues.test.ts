import { describe, expect, it } from 'vitest';

import type { ErrorCorrection, Item } from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW, DEFAULT_HINTS } from './model.js';
import { blockers, isReady, issues, stepState } from './issues.js';
import { spans } from './engine.js';

const inversion: Item = {
  id: 'i1',
  wrong: 'I går jeg gikk på kino.',
  ref: 'I går gikk jeg på kino.',
  alts: [],
  meta: {},
};

function document(overrides: Partial<ErrorCorrection> = {}): ErrorCorrection {
  return {
    id: 'ex1',
    type: 'error_correction',
    moduleId: 'm1',
    title: 'Finn feilen',
    instructions: 'Rett setningene.',
    updatedAt: '2026-08-12T00:00:00.000Z',
    mode: 'sentences',
    note: '',
    items: [inversion],
    hints: { ...DEFAULT_HINTS },
    check: { ...DEFAULT_CHECK },
    flow: { ...DEFAULT_FLOW },
    ai: { ...DEFAULT_AI, on: false },
    ...overrides,
  };
}

const codes = (ex: ErrorCorrection): string[] => issues(ex).map((issue) => issue.code);

describe('issues', () => {
  it('is quiet about a well-formed exercise', () => {
    expect(issues(document())).toEqual([]);
    expect(isReady(document())).toBe(true);
  });

  it('blocks an exercise with nothing to correct', () => {
    expect(codes(document({ items: [] }))).toContain('EX_NO_ITEMS');
    expect(isReady(document({ items: [] }))).toBe(false);
  });

  it('blocks an item with no answer key, and says nothing else about it', () => {
    const found = issues(document({ items: [{ ...inversion, ref: '' }] }));

    expect(found.map((issue) => issue.code)).toEqual(['ITEM_NO_REF']);
  });

  it('blocks two identical lines — there is no mistake to find', () => {
    const same = { ...inversion, ref: inversion.wrong };

    expect(codes(document({ items: [same] }))).toContain('ITEM_IDENTICAL');
  });

  it('blocks an item whose every deviation is accepted both ways', () => {
    const key = spans(inversion, DEFAULT_CHECK)[0]!.key;
    const soft = { ...inversion, meta: { [key]: { soft: true } } };

    expect(codes(document({ items: [soft] }))).toContain('ITEM_ALL_SOFT');
  });

  it('warns when a text carries more than four mistakes', () => {
    const many: Item = {
      id: 'i2',
      wrong: 'I går jeg kom hjem, jeg har bodde her, vi må å gå, hun interesserer meg om det, og de er ikke sulten.',
      ref: 'I går kom jeg hjem, jeg har bodd her, vi må gå, hun interesserer seg for det, og de er ikke sultne.',
      alts: [],
      meta: {},
    };
    const found = codes(document({ items: [many] }));

    expect(found).toContain('ITEM_MANY_ERRORS');
    // The same sentence is also too long to hunt through — both are worth saying.
    expect(found).toContain('ITEM_TOO_LONG');
  });

  it('warns about several mistakes with the count hidden — that is guesswork', () => {
    const two: Item = {
      id: 'i3',
      wrong: 'Hun har bodde her og jeg interesserer meg om det.',
      ref: 'Hun har bodd her og jeg interesserer meg for det.',
      alts: [],
      meta: {},
    };

    expect(codes(document({ items: [two], hints: { ...DEFAULT_HINTS, count: false } }))).toContain(
      'ITEM_COUNT_HIDDEN',
    );
  });

  it('warns when a variant is just the faulty sentence again', () => {
    const withAlt = { ...inversion, alts: [inversion.wrong] };

    expect(codes(document({ items: [withAlt] }))).toContain('ITEM_ALT_EQUALS_WRONG');
  });

  it('warns about the two settings that make the mistake itself invisible', () => {
    expect(codes(document({ check: { ...DEFAULT_CHECK, ignorePunct: true } }))).toContain(
      'CHECK_IGNORE_PUNCT',
    );
    expect(codes(document({ check: { ...DEFAULT_CHECK, caseInsensitive: true } }))).toContain(
      'CHECK_CASE_INSENSITIVE',
    );
  });

  it('warns that the key shown after submitting makes a free retry free', () => {
    const flow = { ...DEFAULT_FLOW, showRefs: 'afterSubmit' as const, attempts: 'free' as const };

    expect(codes(document({ flow }))).toContain('REFS_AFTER_SUBMIT_WITH_RETRIES');
  });

  it('warns that passage mode is holding several separate texts', () => {
    const second: Item = { ...inversion, id: 'i2' };

    expect(codes(document({ mode: 'passage', items: [inversion, second] }))).toContain(
      'PASSAGE_MANY_ITEMS',
    );
  });

  it('reports the missing instruction as a warning, not a blocker', () => {
    expect(blockers(document({ instructions: '' }))).toEqual([]);
    expect(codes(document({ instructions: '' }))).toContain('EX_NO_INSTRUCTION');
  });
});

describe('stepState', () => {
  it('is ok on every step of a well-formed exercise', () => {
    const ex = document();

    expect([1, 2, 3, 4].map((step) => stepState(ex, step as 1).state)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
  });

  it('turns the owning step red and counts its blockers', () => {
    const ex = document({ items: [] });

    expect(stepState(ex, 2)).toEqual({ state: 'err', blockers: 1 });
    expect(stepState(ex, 1).state).toBe('ok');
  });

  it('turns amber on a warning', () => {
    expect(stepState(document({ instructions: '' }), 1).state).toBe('warn');
  });

  it('stays ok on a remark — an amber dot for a remark trains the author to ignore amber', () => {
    const ex = document({ hints: { ...DEFAULT_HINTS, showType: true, count: false } });

    expect(stepState(ex, 3).state).toBe('ok');
  });
});
