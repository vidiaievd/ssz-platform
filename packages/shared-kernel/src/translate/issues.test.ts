import { describe, expect, it } from 'vitest';

import type { Item, Translate } from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW } from './model.js';
import { blockers, isReady, issues, stepState } from './issues.js';

function item(source: string, refs: string[], overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    dir: 'to_target',
    source,
    refs,
    gloss: [],
    require: [],
    forbid: [],
    ...overrides,
  };
}

function exercise(items: Item[], overrides: Partial<Translate> = {}): Translate {
  return {
    id: 'ex1',
    type: 'translate_to_target',
    moduleId: 'm1',
    title: 'Oversettelse',
    instructions: 'Oversett setningene til norsk.',
    updatedAt: '2026-08-13T10:00:00.000Z',
    dir: 'to_target',
    langs: { explain: 'Russisk', target: 'Norsk' },
    format: 'set',
    note: '',
    items,
    check: { ...DEFAULT_CHECK },
    flow: { ...DEFAULT_FLOW },
    ai: { ...DEFAULT_AI, checks: { ...DEFAULT_AI.checks } },
    ...overrides,
  };
}

/** A document with nothing to report, so each test can introduce one fault. */
const clean = () =>
  exercise([
    item('Я живу в Тромсё уже три года.', ['Jeg har bodd i Tromsø i tre (år|år nå).']),
    item('Она спрашивает, когда начинается курс.', ['Hun spør når kurset (begynner|starter).']),
  ]);

const codes = (ex: Translate) => issues(ex).map((issue) => issue.code);

describe('issues', () => {
  it('reports nothing on a well-formed document', () => {
    expect(codes(clean())).toEqual([]);
    expect(isReady(clean())).toBe(true);
  });

  it('blocks a document with no sentences', () => {
    const ex = exercise([item('  ', [])]);

    expect(blockers(ex).map((issue) => issue.code)).toEqual(['EX_NO_ITEMS']);
    expect(isReady(ex)).toBe(false);
  });

  it('blocks a sentence without an answer key, and stops reporting on it', () => {
    const ex = exercise([item('Я живу в Тромсё.', ['  '], { forbid: [{ text: 'bor' }] })]);

    expect(codes(ex)).toEqual(['ITEM_NO_REF']);
  });

  it('warns when the instruction is missing', () => {
    expect(codes(exercise(clean().items, { instructions: '  ' }))).toContain('EX_NO_INSTRUCTION');
  });

  it('warns when a mixed set runs one way only', () => {
    expect(codes(exercise(clean().items, { dir: 'both' }))).toContain('BOTH_ONE_DIRECTION');
  });

  it('says nothing about direction when the set really is mixed', () => {
    const items = [clean().items[0]!, { ...clean().items[1]!, dir: 'from_target' as const }];

    expect(codes(exercise(items, { dir: 'both' }))).not.toContain('BOTH_ONE_DIRECTION');
  });

  it('warns that only the first sentence is used in single format', () => {
    expect(codes(exercise(clean().items, { format: 'single' }))).toContain('SINGLE_MANY_ITEMS');
  });

  it('warns about a sentence long enough to stop being a translation drill', () => {
    const long = Array.from({ length: 19 }, (_, i) => `ord${i}`).join(' ');

    expect(codes(exercise([item(long, ['Noe (a|b)'])]))).toContain('ITEM_TOO_LONG');
  });

  // The most valuable check in the set: it catches a broken bracket, which the author
  // cannot see by reading the line back.
  it('warns about an alternation the author never closed', () => {
    const ex = exercise([item('Я живу здесь.', ['Jeg bor (her'])]);

    expect(codes(ex)).toContain('REF_BROKEN_ALTERNATIVES');
  });

  it('says nothing about a correctly written alternation', () => {
    const ex = exercise([item('Я живу здесь.', ['Jeg bor (her|her nå)'])]);

    expect(codes(ex)).not.toContain('REF_BROKEN_ALTERNATIVES');
  });

  it('warns when a key expands past the engine cap', () => {
    const explosive = '(a|b) (c|d) (e|f) (g|h) (i|j) (k|l) (m|n)';

    expect(codes(exercise([item('x', [explosive])]))).toContain('REF_TOO_MANY_VARIANTS');
  });

  it('blocks a forbidden fragment that stands in the key itself', () => {
    const ex = exercise([item('Я живу здесь.', ['Jeg bor her (nå|)'], { forbid: [{ text: 'bor' }] })]);

    expect(blockers(ex).map((issue) => issue.code)).toEqual(['FORBID_IN_REF']);
  });

  it('warns about a requirement no variant satisfies', () => {
    const ex = exercise([
      item('Я жил здесь.', ['Jeg bodde her (i fjor|)'], { require: [{ text: 'har bodd' }] }),
    ]);

    expect(codes(ex)).toContain('REQUIRE_NOT_IN_REF');
  });

  it('warns when no sentence accepts an alternative, because the queue inherits the rest', () => {
    expect(codes(exercise([item('Я живу здесь.', ['Jeg bor her'])]))).toContain('NO_ALT_VARIANTS');
  });

  it('warns about diacritic folding and about a threshold that swallows everything', () => {
    const ex = clean();
    ex.check.foldDiacritics = true;
    ex.check.near = 0.5;

    expect(codes(ex)).toEqual(
      expect.arrayContaining(['CHECK_FOLD_DIACRITICS', 'CHECK_NEAR_TOO_LOW']),
    );
  });

  it('keeps quiet about the check when the author turned it off', () => {
    const ex = clean();
    ex.check.on = false;
    ex.check.foldDiacritics = true;

    expect(codes(ex)).not.toContain('CHECK_FOLD_DIACRITICS');
  });

  it('remarks that the AI stage has nothing to build on without the check', () => {
    const ex = clean();
    ex.check.on = false;

    expect(codes(ex)).toContain('AI_WITHOUT_CHECK');
  });

  it('warns when AI feedback before submission is unlimited', () => {
    const ex = clean();
    ex.flow.selfCheck = 0;

    expect(codes(ex)).toContain('AI_UNLIMITED_BEFORE_SUBMIT');
  });

  it('reports in authoring order, so client and server can compare lists', () => {
    const ex = exercise([item('  ', [])], { instructions: '' });

    expect(issues(ex).map((issue) => issue.step)).toEqual([1, 2]);
  });
});

describe('stepState', () => {
  it('is ok on a clean document', () => {
    expect(stepState(clean(), 2)).toEqual({ state: 'ok', blockers: 0 });
  });

  it('counts blockers on the step that owns the fix', () => {
    const ex = exercise([item('Я живу здесь.', ['  '])]);

    expect(stepState(ex, 2)).toEqual({ state: 'err', blockers: 1 });
  });

  it('is empty, not ok, when no sentence has been written yet', () => {
    const ex = exercise([]);
    ex.items = [];

    expect(stepState(ex, 2).state).toBe('err'); // EX_NO_ITEMS is a blocker in its own right
    expect(stepState(ex, 1).state).toBe('ok');
  });

  it('does not colour a dot for a remark', () => {
    const ex = clean();
    ex.flow.showRefs = 'afterSubmit'; // REFS_AFTER_SUBMIT, level info

    expect(stepState(ex, 4)).toEqual({ state: 'ok', blockers: 0 });
  });
});
