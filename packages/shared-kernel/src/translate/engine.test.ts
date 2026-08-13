import { describe, expect, it } from 'vitest';

import type { Check, Item, TranslateTask } from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW } from './model.js';
import {
  answerLang,
  authoredItems,
  coverage,
  diff,
  expandRef,
  hasAlts,
  itemDirection,
  judge,
  MAX_VARIANTS,
  norm,
  route,
  runItems,
  sourceLang,
  tokens,
  typoEq,
  variants,
} from './engine.js';

const check: Check = { ...DEFAULT_CHECK };

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

function task(items: Item[], overrides: Partial<TranslateTask> = {}): TranslateTask {
  return {
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

describe('expandRef', () => {
  it('expands one alternation into two acceptable sentences', () => {
    expect(expandRef('Jeg (liker|elsker) katter')).toEqual(['Jeg liker katter', 'Jeg elsker katter']);
  });

  it('makes a fragment optional with an empty branch', () => {
    expect(expandRef('Jeg bor her (nå|)')).toEqual(['Jeg bor her nå', 'Jeg bor her']);
  });

  it('multiplies two groups out to four', () => {
    expect(expandRef('Hun (spør|lurer på) når (kurset|det) begynner')).toHaveLength(4);
  });

  // Nested groups are outside the documented syntax: the pattern matches the inner group
  // first, so the outer one is rewritten branch by branch and the result happens to come
  // out right. Recorded rather than relied on — the builder's bracket check is what tells
  // an author whether their key expanded the way they meant.
  it('resolves nested groups from the inside out', () => {
    expect(expandRef('Jeg ((a|b)|c) det')).toEqual(['Jeg a det', 'Jeg c det', 'Jeg b det']);
  });

  it('is empty for an unwritten key, which is what makes a verdict of noref possible', () => {
    expect(expandRef('   ')).toEqual([]);
  });

  it('recognises a line carrying alternatives, for the builder to expand under it', () => {
    expect(hasAlts('Jeg (liker|elsker) katter')).toBe(true);
    expect(hasAlts('Jeg liker katter')).toBe(false);
  });
});

describe('variants', () => {
  it('collects every key line and deduplicates across them', () => {
    expect(variants(item('x', ['Jeg kommer', 'Jeg (kommer|drar)']))).toEqual([
      'Jeg kommer',
      'Jeg drar',
    ]);
  });

  it('caps a combinatorial key so one item cannot stall a submission', () => {
    const explosive = '(a|b) (c|d) (e|f) (g|h) (i|j) (k|l) (m|n)'; // 128 combinations
    expect(variants(item('x', [explosive]))).toHaveLength(MAX_VARIANTS);
  });
});

describe('norm', () => {
  it('collapses whitespace whatever the settings say', () => {
    expect(norm('  Jeg   kommer  ', { ...check, caseInsensitive: false, ignorePunct: false })).toBe(
      'Jeg kommer',
    );
  });

  it('folds diacritics only when asked, because it hides real spelling mistakes', () => {
    expect(norm('blå', check)).toBe('blå');
    expect(norm('blå', { ...check, foldDiacritics: true })).toBe('bla');
  });
});

describe('typoEq', () => {
  it('accepts one edit in a long word', () => {
    expect(typoEq('tromso', 'tromsø')).toBe(true);
    expect(typoEq('kommer', 'komer')).toBe(true);
  });

  it('refuses short words, where one letter is a different word', () => {
    expect(typoEq('hun', 'han')).toBe(false);
    expect(typoEq('en', 'et')).toBe(false);
  });

  it('refuses two edits', () => {
    expect(typoEq('bodde', 'bidda')).toBe(false);
  });
});

describe('diff', () => {
  it('marks a word only in the answer as extra and one only in the key as missing', () => {
    const scored = diff(tokens('jeg kommer snart', check), tokens('jeg kommer', check), check);

    expect(scored.tokens.map((token) => token.t)).toEqual(['eq', 'eq', 'extra']);
    expect(scored.edits).toBe(1);
  });

  it('keeps the key spelling on a word matched through a typo', () => {
    const scored = diff(tokens('jeg bodde i tromso', check), tokens('jeg bodde i tromsø', check), check);

    expect(scored.tokens.at(-1)).toEqual({ t: 'eq', w: 'tromso', typo: 'tromsø' });
  });

  it('scores an identical sentence at 1', () => {
    expect(diff(tokens('jeg kommer', check), tokens('jeg kommer', check), check).sim).toBe(1);
  });
});

// The table from CHECK_ENGINE.md, kept row for row: it is the contract between this
// engine, the builder's tester and the teacher queue.
describe('judge — the handoff test table', () => {
  const subject = item('Я живу в Тромсё уже три года.', [
    'Jeg har bodd i Tromsø i tre år.',
    'Jeg har bodd i Tromsø i tre år nå.',
  ], {
    require: [{ text: 'har bodd' }],
    forbid: [{ text: 'bor' }],
  });

  const verdictOf = (answer: string) => judge(check, subject, answer).verdict;

  it('exact — the key as written', () => {
    expect(verdictOf('Jeg har bodd i Tromsø i tre år.')).toBe('exact');
  });

  it('exact — case and the full stop are normalised away', () => {
    expect(verdictOf('jeg har bodd i tromsø i tre år')).toBe('exact');
  });

  it('exact — the second accepted variant', () => {
    expect(verdictOf('Jeg har bodd i Tromsø i tre år nå.')).toBe('exact');
  });

  it('typo — one letter in a long word', () => {
    expect(verdictOf('Jeg har bodd i Tromso i tre år.')).toBe('typo');
  });

  it('near — a digit where the key spells the number', () => {
    expect(verdictOf('Jeg har bodd i Tromsø i 3 år.')).toBe('near');
  });

  it('near — a guard demotes an otherwise close answer', () => {
    const judgement = judge(check, subject, 'Jeg bor i Tromsø i tre år.');

    expect(judgement.verdict).toBe('near');
    expect(judgement.banned.map((hit) => hit.text)).toEqual(['bor']);
    expect(judgement.missing.map((hit) => hit.text)).toEqual(['har bodd']);
  });

  // The handoff's table calls this row `near`, reasoning that an LCS barely penalises a
  // changed order. Its own engine disagrees, and so does this one: moving "tre år" across
  // seven words leaves four of fifteen tokens aligned, i.e. sim 0.53, well under the 0.8
  // threshold. Both verdicts route to a teacher, so nothing about the student's run
  // changes — only where the answer sits in the queue's sort order.
  it('off — the same words in another order, once the move is long enough', () => {
    const judgement = judge(check, subject, 'Tre år har jeg bodd i Tromsø.');

    expect(judgement.verdict).toBe('off');
    expect(judgement.sim).toBeLessThan(check.near);
  });

  it('near — the key plus one word of the student\'s own', () => {
    expect(verdictOf('Jeg har bodd i Tromsø i tre lange år.')).toBe('near');
  });

  it('off — a different sentence', () => {
    expect(verdictOf('Jeg liker Tromsø.')).toBe('off');
  });

  it('empty — nothing submitted', () => {
    expect(verdictOf('')).toBe('empty');
  });
});

describe('judge', () => {
  it('reports noref rather than a wrong answer when the author left no key', () => {
    expect(judge(check, item('x', ['']), 'noe').verdict).toBe('noref');
  });

  it('prefers empty over noref: an unanswered item is not an authoring mistake', () => {
    expect(judge(check, item('x', ['']), '   ').verdict).toBe('empty');
  });

  it('compares against the closest variant and says which one it was', () => {
    const judgement = judge(
      check,
      item('x', ['Jeg kommer snart', 'Vi drar i morgen']),
      'vi drar i morgen',
    );

    expect(judgement.ref).toBe('Vi drar i morgen');
    expect(judgement.verdict).toBe('exact');
  });

  it('demotes an exact hit that dodges the form the exercise trains', () => {
    const judgement = judge(check, item('x', ['Jeg bor her'], { forbid: [{ text: 'bor' }] }), 'Jeg bor her');

    expect(judgement.verdict).toBe('near');
    expect(judgement.exact).toBe(false);
  });

  it('carries the author explanation of a guard that fired', () => {
    const judgement = judge(
      check,
      item('x', ['Jeg har bodd her'], {
        require: [{ text: 'har bodd', note: 'Perfektum, ikke presens.' }],
      }),
      'Jeg bor her',
    );

    expect(judgement.missing).toEqual([{ text: 'har bodd', note: 'Perfektum, ikke presens.' }]);
  });

  it('ignores a blank guard', () => {
    const judgement = judge(check, item('x', ['Jeg kommer'], { require: [{ text: '  ' }] }), 'Jeg kommer');

    expect(judgement.verdict).toBe('exact');
  });
});

describe('route', () => {
  const subject = item('x', ['Jeg kommer']);

  it('passes a hit on the key and nothing else', () => {
    const verdicts = ['Jeg kommer', 'Jeg komer', 'Jeg kommer snart', 'Noe helt annet', ''];
    const routes = verdicts.map((answer) => route(check, judge(check, subject, answer)));

    expect(routes).toEqual(['pass', 'teacher', 'teacher', 'teacher', 'teacher']);
  });

  it('sends everything to a teacher when the author turned the check off', () => {
    expect(route({ ...check, on: false }, judge(check, subject, 'Jeg kommer'))).toBe('teacher');
  });

  it('sends everything to a teacher when the author withheld the automatic pass', () => {
    expect(route({ ...check, exactPass: false }, judge(check, subject, 'Jeg kommer'))).toBe('teacher');
  });
});

describe('reading the document', () => {
  it('counts only the sentences the author actually wrote', () => {
    expect(authoredItems(task([item('Har du tid?', ['x']), item('  ', [])]))).toHaveLength(1);
  });

  it('runs the first sentence only in single format', () => {
    const single = task([item('a', ['x']), item('b', ['y'])], { format: 'single' });

    expect(runItems(single).map((each) => each.source)).toEqual(['a']);
  });

  it('reads the item direction only in a mixed set', () => {
    const mixed = task([item('a', ['x'], { dir: 'from_target' })], { dir: 'both' });
    const fixed = task([item('a', ['x'], { dir: 'from_target' })], { dir: 'to_target' });

    expect(itemDirection(mixed, mixed.items[0]!)).toBe('from_target');
    expect(itemDirection(fixed, fixed.items[0]!)).toBe('to_target');
  });

  it('names the language read and the language written for each direction', () => {
    const mixed = task([item('a', ['x'], { dir: 'from_target' }), item('b', ['y'])], { dir: 'both' });

    expect(sourceLang(mixed, mixed.items[0]!)).toBe('Norsk');
    expect(answerLang(mixed, mixed.items[0]!)).toBe('Russisk');
    expect(sourceLang(mixed, mixed.items[1]!)).toBe('Russisk');
    expect(answerLang(mixed, mixed.items[1]!)).toBe('Norsk');
  });
});

describe('coverage', () => {
  it('measures the numbers the builder shows while the author writes', () => {
    const subject = task([
      item('a', ['Jeg (liker|elsker) det'], {
        explanation: 'Begge verbene går.',
        require: [{ text: 'det', note: 'Objektet må med.' }],
        forbid: [{ text: 'den' }],
      }),
      item('b', ['Vi drar']),
      item('  ', []),
    ]);

    expect(coverage(subject)).toEqual({
      items: 2,
      withRef: 2,
      multiVariant: 1,
      variants: 3,
      explained: 1,
      guards: 2,
      guardsExplained: 1,
    });
  });
});
