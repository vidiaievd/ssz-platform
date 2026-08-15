import { describe, expect, it } from 'vitest';

import type { Item, TranslateTask } from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW } from './model.js';
import {
  gradeSubmission,
  MASK,
  selfCheckFeedback,
  toStudentProjection,
} from './projection.js';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    dir: 'to_target',
    source: 'Я живу в Тромсё уже три года.',
    refs: ['Jeg har bodd i Tromsø i tre år.'],
    gloss: [],
    require: [],
    forbid: [],
    ...overrides,
  };
}

function task(items: Item[] = [item()], overrides: Partial<TranslateTask> = {}): TranslateTask {
  return {
    dir: 'to_target',
    langs: { explain: 'Russisk', target: 'Norsk' },
    format: 'set',
    note: 'Fra leksjon 4.',
    items,
    check: { ...DEFAULT_CHECK },
    flow: { ...DEFAULT_FLOW },
    ai: { ...DEFAULT_AI, checks: { ...DEFAULT_AI.checks } },
    ...overrides,
  };
}

describe('toStudentProjection', () => {
  // The invariant the runner rests on: the browser never receives the key.
  it('sends no part of the answer key, the guards or the teacher notes', () => {
    const subject = task([
      item({
        require: [{ text: 'har bodd', note: 'Perfektum.' }],
        forbid: [{ text: 'bor' }],
        explanation: 'Fordi handlingen varer.',
        teacherNote: 'Se over tidsuttrykket.',
      }),
    ]);

    const serialised = JSON.stringify(toStudentProjection(subject));

    for (const secret of ['Tromsø', 'har bodd', 'Perfektum.', 'bor', 'Fordi handlingen', 'Se over']) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('resolves the direction and the two language labels per item', () => {
    const mixed = task([item(), item({ id: 'i2', dir: 'from_target' })], { dir: 'both' });

    expect(toStudentProjection(mixed).items.map((each) => [each.dir, each.sourceLang])).toEqual([
      ['to_target', 'Russisk'],
      ['from_target', 'Norsk'],
    ]);
  });

  it('withholds glosses when the author turned them off', () => {
    const withGloss = item({ gloss: [{ w: 'уже', t: 'allerede' }] });
    const on = toStudentProjection(task([withGloss]));
    const off = toStudentProjection(task([withGloss], { flow: { ...DEFAULT_FLOW, gloss: false } }));

    expect(on.items[0]?.gloss).toEqual([{ w: 'уже', t: 'allerede' }]);
    expect(off.items[0]?.gloss).toBeUndefined();
  });

  it('projects the first sentence only in single format', () => {
    const single = task([item(), item({ id: 'i2' })], { format: 'single' });

    expect(toStudentProjection(single).items).toHaveLength(1);
  });

  it('states whether a hit on the key closes an item, so the runner need not infer it', () => {
    expect(toStudentProjection(task()).exactPasses).toBe(true);
    expect(
      toStudentProjection(task([item()], { check: { ...DEFAULT_CHECK, exactPass: false } })).exactPasses,
    ).toBe(false);
  });
});

describe('selfCheckFeedback', () => {
  const subject = task([
    item({
      require: [{ text: 'har bodd', note: 'Perfektum, ikke presens.' }],
      forbid: [{ text: 'bor', note: 'Presens sier at det gjelder nå.' }],
    }),
  ]);

  // Otherwise three self-checks reconstruct the key one word at a time.
  it('masks the words of the key the student has not written', () => {
    const feedback = selfCheckFeedback(subject, { i1: 'Jeg har bodd i Tromsø i tre' });
    const missing = feedback.items[0]?.tokens?.filter((token) => token.t === 'missing') ?? [];

    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((token) => token.w === MASK)).toBe(true);
  });

  it('stops masking when the key is shown right after submission anyway', () => {
    const revealing = task(subject.items, { flow: { ...DEFAULT_FLOW, showRefs: 'afterSubmit' } });
    const feedback = selfCheckFeedback(revealing, { i1: 'Jeg har bodd i Tromsø i tre' });

    expect(feedback.items[0]?.tokens?.some((token) => token.w === 'år')).toBe(true);
  });

  it('gives a count instead of a diff when the answer is far from the key', () => {
    const feedback = selfCheckFeedback(subject, { i1: 'Jeg liker Tromsø.' });

    expect(feedback.items[0]?.verdict).toBe('off');
    expect(feedback.items[0]?.tokens).toBeUndefined();
    expect(feedback.items[0]?.divergingWords).toBeGreaterThan(0);
  });

  // A fired guard is a statement about the task, not about the key — the one thing this
  // template can explain without inventing a reason.
  it('reports a fired guard in full, with the author explanation', () => {
    const feedback = selfCheckFeedback(subject, { i1: 'Jeg bor i Tromsø i tre år.' });

    expect(feedback.items[0]?.banned).toEqual([
      { text: 'bor', note: 'Presens sier at det gjelder nå.' },
    ]);
    expect(feedback.items[0]?.missing).toEqual([
      { text: 'har bodd', note: 'Perfektum, ikke presens.' },
    ]);
  });

  it('counts how many items would close without a teacher as things stand', () => {
    const pair = task([item(), item({ id: 'i2', refs: ['Vi drar.'] })]);
    const feedback = selfCheckFeedback(pair, {
      i1: 'jeg har bodd i tromsø i tre år',
      i2: 'Vi reiser.',
    });

    expect(feedback.passing).toBe(1);
  });
});

describe('gradeSubmission', () => {
  it('scores every item and routes each one, key included for the teacher queue', () => {
    const pair = task([item(), item({ id: 'i2', refs: ['Vi drar.'] })]);

    expect(
      gradeSubmission(pair, { i1: 'Jeg har bodd i Tromsø i tre år.', i2: 'Vi reiser i morgen.' }).map(
        (outcome) => [outcome.itemId, outcome.verdict, outcome.routing],
      ),
    ).toEqual([
      ['i1', 'exact', 'pass'],
      ['i2', 'off', 'teacher'],
    ]);
  });

  it('scores an item the student skipped as empty, and sends it to a teacher', () => {
    const [outcome] = gradeSubmission(task(), {});

    expect(outcome?.verdict).toBe('empty');
    expect(outcome?.routing).toBe('teacher');
  });
});
