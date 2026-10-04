// Plan 64 §2б — the lesson recipe: axes not types, elements not exercises, never a gate.

import { describe, expect, it } from 'vitest';

import type { AtomRef, DeriveInput } from './derive.js';
import type { Recipe, RecipeRule } from './recipe.js';
import {
  checkRecipe,
  elementsOf,
  EMPTY_RECIPE,
  MAX_RECIPE_RULES,
  parseRecipe,
  parseRule,
  readRecipe,
  RECIPE_PRESET_IDS,
  RECIPE_PRESETS,
} from './recipe.js';

const ex = (templateCode: string, rest: Partial<DeriveInput> = {}): DeriveInput => ({
  templateCode,
  ...rest,
});

const keyed = (...items: [string, string][]): AtomRef[] =>
  items.map(([itemKey, atomType]) => ({ itemKey, atomType }));

const produces: RecipeRule = { axis: 'output', values: ['none'], negate: true, min: 1 };
const mostlyPicked: RecipeRule = { axis: 'modality', values: ['recognition'], maxShare: 0.6 };

describe('the check of plan 64, phase 10', () => {
  const recipe: Recipe = { rules: [produces] };

  it('warns about a lesson of three multiple-choice sets', () => {
    const lesson = [ex('multiple_choice'), ex('multiple_choice'), ex('multiple_choice')];
    expect(checkRecipe(lesson, recipe)).toEqual([
      { code: 'RECIPE_BELOW_MIN', level: 'warning', ruleIndex: 0, rule: produces, count: 0, min: 1, total: 3 },
    ]);
  });

  it('is satisfied once a short answer is added', () => {
    const lesson = [ex('multiple_choice'), ex('multiple_choice'), ex('multiple_choice'), ex('short_answer')];
    expect(checkRecipe(lesson, recipe)).toEqual([]);
  });

  it('never returns a blocker', () => {
    const lesson = [ex('multiple_choice'), ex('match_pairs')];
    for (const id of RECIPE_PRESET_IDS)
      for (const issue of checkRecipe(lesson, RECIPE_PRESETS[id])) expect(issue.level).toBe('warning');
  });
});

describe('elements, not exercises', () => {
  it('counts a set by its addressed items', () => {
    const set = ex('multiple_choice', {
      atoms: keyed(['q1', 'vocabulary_word'], ['q2', 'vocabulary_word'], ['q3', 'grammar_rule']),
    });
    const elements = elementsOf(set);
    expect(elements).toHaveLength(3);
    expect(elements.map((e) => e.focus)).toEqual([['vocabulary'], ['vocabulary'], ['grammar']]);
    expect(new Set(elements.map((e) => e.modality))).toEqual(new Set(['recognition']));
  });

  it('counts an exercise nobody addressed as one', () => {
    expect(elementsOf(ex('multiple_choice'))).toHaveLength(1);
    expect(elementsOf(ex('multiple_choice', { atoms: [{ atomType: 'grammar_rule' }] }))).toHaveLength(1);
  });

  it('lets one set of eight outweigh one piece of writing', () => {
    // Counted per exercise this lesson is half recognition; counted in elements it is 8/9.
    const set = ex('multiple_choice', {
      atoms: keyed(...Array.from({ length: 8 }, (_, i): [string, string] => [`q${i}`, 'vocabulary_word'])),
    });
    const issues = checkRecipe([set, ex('writing_task')], { rules: [mostlyPicked] });
    expect(issues).toEqual([
      {
        code: 'RECIPE_ABOVE_SHARE',
        level: 'warning',
        ruleIndex: 0,
        rule: mostlyPicked,
        count: 8,
        maxShare: 0.6,
        total: 9,
      },
    ]);
  });

  it('spreads a whole-exercise atom over every element', () => {
    const set = ex('multiple_choice', {
      atoms: [...keyed(['q1', 'vocabulary_word'], ['q2', 'vocabulary_word']), { atomType: 'grammar_rule' }],
    });
    expect(elementsOf(set).map((e) => e.focus)).toEqual([
      ['vocabulary', 'grammar'],
      ['vocabulary', 'grammar'],
    ]);
  });

  it('keeps a structural subject on every element beside its atoms (plan 68)', () => {
    const set = ex('dictation', { atoms: keyed(['s1', 'vocabulary_word'], ['s2', 'phrase']) });
    expect(elementsOf(set).map((e) => e.focus)).toEqual([['vocabulary', 'orthography'], ['orthography']]);
  });

  it('keeps an element whose atom names no subject', () => {
    const set = ex('multiple_choice', { atoms: keyed(['q1', 'grammar_rule'], ['q2', 'phrase']) });
    expect(elementsOf(set).map((e) => e.focus)).toEqual([['grammar'], []]);
  });

  it('lets the author outrank the graph on the subject, but not on the count', () => {
    const set = ex('multiple_choice', {
      atoms: keyed(['q1', 'grammar_rule'], ['q2', 'grammar_rule']),
      override: { skills: ['reading'], focus: ['pragmatics'], setAt: '2026-10-02' },
    });
    expect(elementsOf(set).map((e) => e.focus)).toEqual([['pragmatics'], ['pragmatics']]);
  });

  it('inherits the channel of the exercise', () => {
    const heard = ex('short_answer', { content: { audio: { enabled: true } } });
    const [element] = elementsOf(heard);
    expect(element).toMatchObject({ input: 'audio', output: 'written_target', skills: ['listening', 'written'] });
  });
});

describe('matching', () => {
  it('reads "not none" so a new output would still count', () => {
    expect(checkRecipe([ex('translate_from_target')], { rules: [produces] })).toEqual([]);
  });

  it('matches list axes on any member', () => {
    const rule: RecipeRule = { axis: 'skill', values: ['listening'], min: 1 };
    const heard = ex('short_answer', { content: { audio: { enabled: true } } });
    expect(checkRecipe([heard], { rules: [rule] })).toEqual([]);
    expect(checkRecipe([ex('short_answer')], { rules: [rule] })).toHaveLength(1);
  });

  it('allows a ceiling of exactly the share', () => {
    const lesson = [ex('multiple_choice'), ex('multiple_choice'), ex('multiple_choice'), ex('short_answer'), ex('writing_task')];
    expect(checkRecipe(lesson, { rules: [mostlyPicked] })).toEqual([]);
  });
});

describe('what it stays quiet about', () => {
  it('says nothing about an empty lesson', () => {
    for (const id of RECIPE_PRESET_IDS) expect(checkRecipe([], RECIPE_PRESETS[id])).toEqual([]);
  });

  it('says nothing under an empty recipe', () => {
    expect(checkRecipe([ex('multiple_choice')], EMPTY_RECIPE)).toEqual([]);
  });
});

describe('the presets', () => {
  it('are recipes their own parser accepts unchanged', () => {
    for (const id of RECIPE_PRESET_IDS) {
      const preset = RECIPE_PRESETS[id];
      expect(parseRecipe(JSON.parse(JSON.stringify(preset)))).toEqual(preset);
    }
  });

  it('never ask for speech', () => {
    // Nothing records it; such a rule would fail on every lesson of every course.
    for (const id of RECIPE_PRESET_IDS)
      for (const rule of RECIPE_PRESETS[id].rules as readonly RecipeRule[]) {
        expect((rule.values as readonly string[]).includes('spoken') && !rule.negate).toBe(false);
      }
  });

  it('are satisfiable by today’s templates', () => {
    const heard = (code: string) => ex(code, { content: { audio: { enabled: true } } });
    const grammar = (code: string, n: number, content?: unknown) =>
      ex(code, {
        content,
        atoms: keyed(...Array.from({ length: n }, (_, i): [string, string] => [`i${i}`, 'grammar_rule'])),
      });

    expect(checkRecipe([ex('multiple_choice'), heard('short_answer')], RECIPE_PRESETS.balanced_a1_a2)).toEqual([]);
    expect(
      checkRecipe(
        [ex('multiple_choice'), ex('multiple_choice_group'), heard('short_answer'), heard('short_answer'), ex('writing_task')],
        RECIPE_PRESETS.exam_b1,
      ),
    ).toEqual([]);
    expect(
      checkRecipe(
        [
          grammar('word_bank_gap_fill', 2, { settings: { input: 'free' } }),
          grammar('short_answer', 2),
          ex('multiple_choice'),
        ],
        RECIPE_PRESETS.grammar_intensive,
      ),
    ).toEqual([]);
  });
});

describe('parsing', () => {
  it('keeps a well-formed rule', () => {
    expect(parseRule({ axis: 'input', values: ['audio', 'audio'], min: 2 })).toEqual({
      axis: 'input',
      values: ['audio'],
      min: 2,
    });
  });

  it('drops a rule rather than a value it does not know', () => {
    expect(parseRule({ axis: 'output', values: ['none', 'sung'], negate: true, min: 1 })).toBeNull();
  });

  it('refuses a rule with both bounds, or neither', () => {
    expect(parseRule({ axis: 'input', values: ['audio'], min: 1, maxShare: 0.5 })).toBeNull();
    expect(parseRule({ axis: 'input', values: ['audio'] })).toBeNull();
  });

  it('refuses bounds that say nothing', () => {
    expect(parseRule({ axis: 'input', values: ['audio'], min: 0 })).toBeNull();
    expect(parseRule({ axis: 'input', values: ['audio'], min: 1.5 })).toBeNull();
    expect(parseRule({ axis: 'modality', values: ['recognition'], maxShare: 1 })).toBeNull();
    expect(parseRule({ axis: 'modality', values: ['recognition'], maxShare: 0 })).not.toBeNull();
  });

  it('refuses an unknown axis and an empty list', () => {
    expect(parseRule({ axis: 'retrieval', values: ['select'], maxShare: 0.6 })).toBeNull();
    expect(parseRule({ axis: 'input', values: [], min: 1 })).toBeNull();
  });

  it('reads anything that is not a recipe as the empty one', () => {
    expect(parseRecipe(null)).toEqual(EMPTY_RECIPE);
    expect(parseRecipe({ rules: 'all' })).toEqual(EMPTY_RECIPE);
    expect(parseRecipe({ rules: [produces, { axis: 'nope' }] })).toEqual({ rules: [produces] });
  });
});

describe('reading a recipe to store', () => {
  it('keeps a recipe whose every rule parses', () => {
    expect(readRecipe({ rules: [produces, mostlyPicked] })).toEqual({ rules: [produces, mostlyPicked] });
    expect(readRecipe({ rules: [] })).toEqual(EMPTY_RECIPE);
  });

  it('refuses the whole recipe for one bad rule, instead of storing a shorter one', () => {
    expect(readRecipe({ rules: [produces, { axis: 'nope' }] })).toBeNull();
  });

  it('refuses what is not a recipe, and one too long to be a method', () => {
    expect(readRecipe(null)).toBeNull();
    expect(readRecipe({ rules: 'all' })).toBeNull();
    expect(readRecipe({ rules: Array.from({ length: MAX_RECIPE_RULES + 1 }, () => produces) })).toBeNull();
  });
});
