// Plan 55 §3.4 — the chain, and the two rules of by-template.ts.

import { describe, expect, it } from 'vitest';

import { BY_TEMPLATE } from './by-template.js';
import { deriveSkills } from './derive.js';
import { FOCUSES, SKILLS } from './model.js';

describe('the table', () => {
  it('covers all thirteen template codes of the catalogue', () => {
    expect(Object.keys(BY_TEMPLATE).sort()).toEqual(
      [
        'error_correction',
        'fill_in_blank',
        'match_pairs',
        'multiple_choice',
        'multiple_choice_group',
        'sentence_schema',
        'short_answer',
        'text_order',
        'translate_from_target',
        'translate_to_target',
        'word_bank_fill',
        'word_bank_gap_fill',
        'writing_task',
      ].sort(),
    );
  });

  it('names only known axis members, in canonical order', () => {
    for (const [code, profile] of Object.entries(BY_TEMPLATE)) {
      expect(profile.skills, code).toEqual(SKILLS.filter((s) => profile.skills.includes(s)));
      expect(profile.focus, code).toEqual(FOCUSES.filter((f) => profile.focus.includes(f)));
    }
  });

  it('never claims spoken: nothing on the platform records speech', () => {
    for (const [code, profile] of Object.entries(BY_TEMPLATE))
      expect(profile.skills, code).not.toContain('spoken');
  });

  it('splits the two translate types by the language the answer is in (rule 1)', () => {
    // Producing target-language sentences is written production…
    expect(deriveSkills({ templateCode: 'translate_to_target' }).skills).toEqual(['written']);
    // …answering in the language of explanation is not. Only the reading is measured.
    expect(deriveSkills({ templateCode: 'translate_from_target' }).skills).toEqual(['reading']);
  });

  it('gives no focus hint where the author, not the type, decides the subject (rule 2)', () => {
    for (const code of ['multiple_choice', 'short_answer', 'writing_task', 'text_order'])
      expect(deriveSkills({ templateCode: code }).focus, code).toEqual([]);
  });
});

describe('the chain', () => {
  const audio = { audio: { enabled: true } };
  const override = { skills: ['spoken'], focus: ['pragmatics'], setAt: new Date() };
  const placement = { listeningStage: 'comprehension' as const };

  it('falls back to the template when nothing else speaks', () => {
    const result = deriveSkills({ templateCode: 'short_answer' });
    expect(result.skills).toEqual(['reading', 'written']);
    expect(result.skillSource).toBe('template');
  });

  it('lets the document outrank the template', () => {
    const result = deriveSkills({ templateCode: 'short_answer', content: audio });
    expect(result.skills).toEqual(['listening']);
    expect(result.skillSource).toBe('document');
  });

  it('lets placement outrank the document', () => {
    const result = deriveSkills({ templateCode: 'short_answer', content: audio, placement });
    expect(result.skillSource).toBe('placement');
  });

  it('lets the override outrank everything', () => {
    const result = deriveSkills({ templateCode: 'short_answer', content: audio, placement, override });
    expect(result.skills).toEqual(['spoken']);
    expect(result.skillSource).toBe('override');
  });

  it('reads a reading exercise as listening when it stands as a listening stage', () => {
    // The point of the placement rung: a short_answer about a recording is not reading.
    const result = deriveSkills({ templateCode: 'short_answer', placement: { listeningStage: 'gap_fill' } });
    expect(result.skills).toEqual(['listening']);
  });

  it('treats a video comprehension question and an audio lesson the same way', () => {
    expect(deriveSkills({ templateCode: 'multiple_choice', placement: { videoQuestion: true } }).skills).toEqual([
      'listening',
    ]);
    expect(deriveSkills({ templateCode: 'multiple_choice', placement: { lessonKind: 'audio' } }).skills).toEqual([
      'listening',
    ]);
  });

  it('ignores a placement that says nothing', () => {
    const result = deriveSkills({ templateCode: 'match_pairs', placement: { lessonKind: 'text' } });
    expect(result.skillSource).toBe('template');
  });

  it('returns unknown for a template code it has never heard of', () => {
    const result = deriveSkills({ templateCode: 'dictation_2027' });
    expect(result.skills).toEqual([]);
    expect(result.skillSource).toBe('unknown');
    expect(result.form).toBe('unknown');
  });
});

describe('the override marker', () => {
  it('distinguishes "trains nothing" from "never spoke"', () => {
    // Prisma cannot hold a nullable array, so the marker is what separates the two.
    const silent = deriveSkills({ templateCode: 'match_pairs', override: { skills: [], focus: [] } });
    expect(silent.skills).toEqual(['reading']);
    expect(silent.skillSource).toBe('template');

    const deliberate = deriveSkills({
      templateCode: 'match_pairs',
      override: { skills: [], focus: [], setAt: '2026-09-01T00:00:00.000Z' },
    });
    expect(deliberate.skills).toEqual([]);
    expect(deliberate.skillSource).toBe('override');
  });

  it('drops values that are not axis members', () => {
    const result = deriveSkills({
      templateCode: 'match_pairs',
      override: { skills: ['reading', 'swimming', 7], focus: ['grammar', null], setAt: new Date() },
    });
    expect(result.skills).toEqual(['reading']);
    expect(result.focus).toEqual(['grammar']);
  });

  it('orders and deduplicates whatever it is given', () => {
    const result = deriveSkills({
      templateCode: 'match_pairs',
      override: { skills: ['written', 'listening', 'written'], setAt: new Date() },
    });
    expect(result.skills).toEqual(['listening', 'written']);
  });
});

describe('word_bank_gap_fill, the template whose document decides', () => {
  it('is written production when the learner types', () => {
    const result = deriveSkills({
      templateCode: 'word_bank_gap_fill',
      content: { settings: { input: 'free' } },
    });
    expect(result.skills).toEqual(['written']);
    expect(result.form).toBe('free');
    expect(result.skillSource).toBe('document');
  });

  it('is recognition when the words are on offer', () => {
    const result = deriveSkills({
      templateCode: 'word_bank_gap_fill',
      content: { settings: { input: 'bank' } },
    });
    expect(result.skills).toEqual(['reading']);
    expect(result.form).toBe('bank');
  });

  it('falls back to the template when the document says nothing', () => {
    const result = deriveSkills({ templateCode: 'word_bank_gap_fill', content: {} });
    expect(result.form).toBe('mixed');
    expect(result.skillSource).toBe('template');
  });
});

describe('old document forms (plan 55 §6 caveat 1, question Q6)', () => {
  // 139 short_answer, 135 fill_in_blank and 121 multiple_choice are still in the old
  // form, and there will be no re-seed before the structures are finished. Derivation
  // keys off the template code, so the shape of the document must not matter.
  const cases: Array<[string, unknown, unknown]> = [
    ['short_answer', { question: 'Hva heter hun?', answer: 'Diana' }, { items: [{ id: 'q1', prompt: 'Hva heter hun?' }] }],
    ['multiple_choice', { question: 'x', options: ['a', 'b'] }, { questions: [{ id: 'q1', stem: 'x', options: [] }] }],
    ['fill_in_blank', { text: 'Jeg ___ norsk.' }, { sentences: [] }],
  ];

  for (const [code, oldForm, newForm] of cases)
    it(`derives the same axes from either form of ${code}`, () => {
      const before = deriveSkills({ templateCode: code, content: oldForm });
      const after = deriveSkills({ templateCode: code, content: newForm });
      expect(before).toEqual(after);
      expect(before.skillSource).toBe('template');
    });
});

describe('focus, which has its own chain', () => {
  it('prefers the atom graph over the template hint', () => {
    const result = deriveSkills({
      templateCode: 'match_pairs',
      atoms: [{ atomType: 'grammar_rule' }],
    });
    expect(result.focus).toEqual(['grammar']);
    expect(result.focusSource).toBe('atoms');
  });

  it('reads both kinds of atom, in canonical order', () => {
    const result = deriveSkills({
      templateCode: 'short_answer',
      atoms: [{ atomType: 'GRAMMAR_RULE' }, { atomType: 'vocabulary_word' }, { atomType: 'word' }],
    });
    expect(result.focus).toEqual(['vocabulary', 'grammar']);
  });

  it('falls back to the template hint where the type has one', () => {
    const result = deriveSkills({ templateCode: 'error_correction' });
    expect(result.focus).toEqual(['grammar']);
    expect(result.focusSource).toBe('template');
  });

  it('says unknown rather than guessing', () => {
    // The seeded catalogue has no ContentRelation rows at all, so this is the common
    // case today — and the report has an `unknown` bucket precisely for it.
    const result = deriveSkills({ templateCode: 'writing_task', atoms: [] });
    expect(result.focus).toEqual([]);
    expect(result.focusSource).toBe('unknown');
  });

  it('ignores an atom type it does not recognise', () => {
    const result = deriveSkills({ templateCode: 'writing_task', atoms: [{ atomType: 'can_do_descriptor' }] });
    expect(result.focusSource).toBe('unknown');
  });
});
