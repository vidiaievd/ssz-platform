// Plan 55 §3.4 — the chain, and the two rules of by-template.ts.

import { describe, expect, it } from 'vitest';

import { BY_TEMPLATE } from './by-template.js';
import { deriveSkills, structuralFocus } from './derive.js';
import { channelsOf, FOCUSES } from './model.js';

describe('the table', () => {
  it('covers every template code of the catalogue', () => {
    expect(Object.keys(BY_TEMPLATE).sort()).toEqual(
      [
        'dictation',
        'error_correction',
        'fill_in_blank',
        'highlight_in_text',
        'inflection_table',
        'match_pairs',
        'multiple_choice',
        'multiple_choice_group',
        'read_aloud',
        'sentence_schema',
        'short_answer',
        'sort_into_buckets',
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
    for (const [code, profile] of Object.entries(BY_TEMPLATE))
      expect(profile.focus, code).toEqual(FOCUSES.filter((f) => profile.focus.includes(f)));
  });

  it('claims spoken only for read_aloud — the one type that records speech (plan 70)', () => {
    for (const [code, profile] of Object.entries(BY_TEMPLATE)) {
      const spoken = channelsOf(profile.input, profile.output).includes('spoken');
      expect(spoken, code).toBe(code === 'read_aloud');
    }
  });

  it('counts the same channels per template as before the split (plan 64, phase 6)', () => {
    // The split is a change of shape, not of judgement: on a bare template every row
    // must still name the channels it named as a flat list.
    const before: Record<string, string[]> = {
      multiple_choice: ['reading'],
      multiple_choice_group: ['reading'],
      fill_in_blank: ['written'],
      word_bank_fill: ['reading'],
      word_bank_gap_fill: ['written'],
      text_order: ['reading'],
      error_correction: ['reading', 'written'],
      translate_to_target: ['written'],
      translate_from_target: ['reading'],
      match_pairs: ['reading'],
      short_answer: ['reading', 'written'],
      writing_task: ['written'],
      sentence_schema: ['written'],
      sort_into_buckets: ['reading'],
      highlight_in_text: ['reading'],
      dictation: ['listening', 'written'],
      inflection_table: ['reading', 'written'],
    };
    for (const [code, skills] of Object.entries(before))
      expect(deriveSkills({ templateCode: code }).skills, code).toEqual(skills);
  });

  it('splits the two translate types by the language the answer is in (rule 1)', () => {
    // Producing target-language sentences is written production…
    expect(deriveSkills({ templateCode: 'translate_to_target' }).skills).toEqual(['written']);
    // …answering in the language of explanation is not. Only the reading is measured.
    expect(deriveSkills({ templateCode: 'translate_from_target' }).skills).toEqual(['reading']);
  });

  it('gives no focus hint where the author, not the type, decides the subject (rule 2)', () => {
    for (const code of ['multiple_choice', 'short_answer', 'writing_task', 'text_order', 'sort_into_buckets', 'highlight_in_text'])
      expect(deriveSkills({ templateCode: code }).focus, code).toEqual([]);
  });
});

describe('sort_into_buckets (plan 66)', () => {
  it('is read, recognised, and becomes listening when the audio layer is on', () => {
    const bare = deriveSkills({ templateCode: 'sort_into_buckets' });
    expect(bare).toMatchObject({ input: 'text', output: 'none', skills: ['reading'], modality: 'recognition' });
    const heard = deriveSkills({ templateCode: 'sort_into_buckets', content: { audio: { enabled: true } } });
    expect(heard).toMatchObject({ input: 'audio', skills: ['listening'], skillSource: 'document' });
  });

  it('takes its subject from the atoms its items address', () => {
    const atoms = [{ atomType: 'grammar_rule', itemKey: 'i1' }];
    expect(deriveSkills({ templateCode: 'sort_into_buckets', atoms }).focus).toEqual(['grammar']);
  });
});

describe('highlight_in_text (plan 67)', () => {
  it('is read, recognised from the passage, and becomes listening when the audio layer is on', () => {
    const bare = deriveSkills({ templateCode: 'highlight_in_text' });
    expect(bare).toMatchObject({ input: 'text', output: 'none', skills: ['reading'], modality: 'recognition', focus: [] });
    const heard = deriveSkills({ templateCode: 'highlight_in_text', content: { audio: { enabled: true } } });
    expect(heard).toMatchObject({ input: 'audio', skills: ['listening'], skillSource: 'document' });
  });

  it('takes its subject from the atoms its questions address', () => {
    const atoms = [{ atomType: 'vocabulary_item', itemKey: 'q1' }];
    expect(deriveSkills({ templateCode: 'highlight_in_text', atoms }).focus).toEqual(['vocabulary']);
  });
});

describe('dictation (plan 68)', () => {
  it('is heard and written from nothing on the bare template, the layer changing nothing', () => {
    const bare = deriveSkills({ templateCode: 'dictation' });
    expect(bare).toMatchObject({
      input: 'audio',
      output: 'written_target',
      skills: ['listening', 'written'],
      form: 'free',
      modality: 'recall',
    });
    // The document always carries the block switched on; reading it must not move a thing.
    const heard = deriveSkills({ templateCode: 'dictation', content: { audio: { enabled: true } } });
    expect(heard).toMatchObject({ input: 'audio', skills: ['listening', 'written'] });
  });

  it('takes orthography from the template — the one type that closes that axis', () => {
    expect(deriveSkills({ templateCode: 'dictation' })).toMatchObject({
      focus: ['orthography'],
      focusSource: 'template',
    });
  });

  it('keeps orthography when atoms are attached — they add to the type, not replace it', () => {
    const atoms = [
      { atomType: 'vocabulary_word', itemKey: 's1' },
      { atomType: 'vocabulary_word', itemKey: 's2' },
    ];
    expect(deriveSkills({ templateCode: 'dictation', atoms })).toMatchObject({
      focus: ['vocabulary', 'orthography'],
      focusSource: 'atoms',
      // Every sentence is about its word and about spelling it.
      focusWeights: { vocabulary: 1, orthography: 1 },
    });
  });

  it('leaves a non-structural hint to yield to the atoms, as before', () => {
    const atoms = [{ atomType: 'grammar_rule', itemKey: 'p1' }];
    expect(deriveSkills({ templateCode: 'match_pairs', atoms }).focus).toEqual(['grammar']);
  });
});

describe('inflection_table (plan 69)', () => {
  it('is read and written from memory when typed', () => {
    const typed = deriveSkills({ templateCode: 'inflection_table', content: { input: { mode: 'type' } } });
    expect(typed).toMatchObject({
      input: 'text',
      output: 'written_target',
      skills: ['reading', 'written'],
      form: 'free',
      modality: 'recall',
      modalitySource: 'template',
    });
    // A document that says nothing about the input reads as typing, the template's half.
    expect(deriveSkills({ templateCode: 'inflection_table' })).toMatchObject({ form: 'free', modality: 'recall' });
  });

  it('is recognised from a bank, and still written (deviation 1)', () => {
    const bank = deriveSkills({ templateCode: 'inflection_table', content: { input: { mode: 'bank' } } });
    expect(bank).toMatchObject({
      input: 'text',
      output: 'written_target',
      skills: ['reading', 'written'],
      form: 'bank',
      modality: 'recognition',
      modalitySource: 'document',
      // The mode moves how it is answered, not what it is counted as.
      skillSource: 'template',
    });
  });

  it('becomes listening with the layer on, in both modes', () => {
    const audio = { enabled: true };
    const typed = deriveSkills({ templateCode: 'inflection_table', content: { audio, input: { mode: 'type' } } });
    expect(typed).toMatchObject({ input: 'audio', skills: ['listening', 'written'], form: 'free', modality: 'recall' });
    // Unlike the frozen gap-fill reading, the bank still reads as a bank with sound.
    const bank = deriveSkills({ templateCode: 'inflection_table', content: { audio, input: { mode: 'bank' } } });
    expect(bank).toMatchObject({ input: 'audio', skills: ['listening', 'written'], form: 'bank', modality: 'recognition' });
  });

  it('takes grammar from the template, and keeps it when a row addresses its word', () => {
    expect(deriveSkills({ templateCode: 'inflection_table' })).toMatchObject({
      focus: ['grammar'],
      focusSource: 'template',
    });
    const atoms = [
      { atomType: 'vocabulary_item', itemKey: 'r1:defSg' },
      { atomType: 'vocabulary_item', itemKey: 'r1:indefPl' },
    ];
    expect(deriveSkills({ templateCode: 'inflection_table', atoms })).toMatchObject({
      focus: ['vocabulary', 'grammar'],
      focusSource: 'atoms',
      // The column is the atom: every cell is about its rule, whatever word it inflects.
      focusWeights: { vocabulary: 1, grammar: 1 },
    });
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

  it('lets the document outrank the template, for the input only', () => {
    // A short answer to a recording is heard and still written (plan 64, decision F).
    const result = deriveSkills({ templateCode: 'short_answer', content: audio });
    expect(result.skills).toEqual(['listening', 'written']);
    expect(result.input).toBe('audio');
    expect(result.output).toBe('written_target');
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
    // The point of the placement rung: a short_answer about a recording is not reading —
    // and, since the split, it does not stop being written either.
    const result = deriveSkills({ templateCode: 'short_answer', placement: { listeningStage: 'gap_fill' } });
    expect(result.skills).toEqual(['listening', 'written']);
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

  // Decision H of plan 64: a set of eight questions, three about words and five
  // about a rule, is three-eighths vocabulary — not "both subjects, equally".
  it('weighs the subject by elements when the graph names them', () => {
    const atoms = [
      { atomType: 'vocabulary_item', itemKey: 'q1' },
      { atomType: 'vocabulary_item', itemKey: 'q2' },
      { atomType: 'vocabulary_item', itemKey: 'q3' },
      { atomType: 'grammar_rule_atom', itemKey: 'q4' },
      { atomType: 'grammar_rule_atom', itemKey: 'q5' },
      { atomType: 'grammar_rule_atom', itemKey: 'q6' },
      { atomType: 'grammar_rule_atom', itemKey: 'q7' },
      { atomType: 'grammar_rule_atom', itemKey: 'q8' },
    ];

    const result = deriveSkills({ templateCode: 'multiple_choice', atoms });

    expect(result.focus).toEqual(['vocabulary', 'grammar']);
    expect(result.focusWeights.vocabulary).toBeCloseTo(3 / 8);
    expect(result.focusWeights.grammar).toBeCloseTo(5 / 8);
  });

  it('counts an element naming both subjects in both', () => {
    const result = deriveSkills({
      templateCode: 'short_answer',
      atoms: [
        { atomType: 'vocabulary_item', itemKey: 'q1' },
        { atomType: 'grammar_rule_atom', itemKey: 'q1' },
        { atomType: 'grammar_rule_atom', itemKey: 'q2' },
      ],
    });

    expect(result.focusWeights.vocabulary).toBeCloseTo(0.5);
    expect(result.focusWeights.grammar).toBeCloseTo(1);
  });

  // The older graph says "this exercise is about grammar", which is one exercise's
  // worth of evidence however many rows carry it.
  it('treats atoms with no element key as one statement about the whole exercise', () => {
    const result = deriveSkills({
      templateCode: 'match_pairs',
      atoms: [{ atomType: 'grammar_rule' }, { atomType: 'grammar_rule' }],
    });

    expect(result.focusWeights).toEqual({ grammar: 1 });
  });

  // A template's hint is a claim about the type; weighing it would invent a
  // precision nobody recorded.
  it('weighs nothing when the subject did not come from the graph', () => {
    expect(deriveSkills({ templateCode: 'error_correction' }).focusWeights).toEqual({});
    expect(deriveSkills({ templateCode: 'writing_task', atoms: [] }).focusWeights).toEqual({});
  });

  it('ignores an atom type it does not recognise', () => {
    const result = deriveSkills({ templateCode: 'writing_task', atoms: [{ atomType: 'can_do_descriptor' }] });
    expect(result.focusSource).toBe('unknown');
  });
});

describe('modality, the second axis (plan 63 §2 E)', () => {
  it('reads the gap-fill flag, because the template covers both modalities', () => {
    const bank = deriveSkills({
      templateCode: 'word_bank_gap_fill',
      content: { settings: { input: 'bank' } },
    });
    expect(bank.modality).toBe('recognition');
    expect(bank.modalitySource).toBe('document');

    const free = deriveSkills({
      templateCode: 'word_bank_gap_fill',
      content: { settings: { input: 'free' } },
    });
    expect(free.modality).toBe('recall');
    expect(free.modalitySource).toBe('document');
  });

  it('says unknown for a gap-fill whose document has not chosen', () => {
    // The template row is `unknown` on purpose: guessing would be wrong for half the
    // catalogue whichever way it guessed.
    const result = deriveSkills({ templateCode: 'word_bank_gap_fill' });
    expect(result.modality).toBe('unknown');
    expect(result.modalitySource).toBe('unknown');
  });

  it('falls back to the template for every other type', () => {
    expect(deriveSkills({ templateCode: 'writing_task' }).modality).toBe('production');
    expect(deriveSkills({ templateCode: 'multiple_choice' }).modality).toBe('recognition');
    expect(deriveSkills({ templateCode: 'sentence_schema' }).modality).toBe('recall');
    expect(deriveSkills({ templateCode: 'writing_task' }).modalitySource).toBe('template');
  });

  /**
   * The distinction the axis exists for: two `bank` templates can differ in modality, and
   * one template's two documents can differ in it while the form says the same word.
   */
  it('is not a second name for the answer form', () => {
    const schema = deriveSkills({ templateCode: 'sentence_schema' });
    expect(schema.form).toBe('bank');
    expect(schema.modality).toBe('recall');
  });

  it('lets the author overrule it, and ignores a value it does not recognise', () => {
    const spoken = deriveSkills({
      templateCode: 'multiple_choice',
      override: { skills: ['reading'], focus: [], modality: 'production', setAt: new Date() },
    });
    expect(spoken.modality).toBe('production');
    expect(spoken.modalitySource).toBe('override');

    const nonsense = deriveSkills({
      templateCode: 'multiple_choice',
      override: { skills: ['reading'], focus: [], modality: 'fluency', setAt: new Date() },
    });
    expect(nonsense.modality).toBe('recognition');
    expect(nonsense.modalitySource).toBe('template');
  });

  it('is not touched by placement — a heard prompt is still answered the same way', () => {
    const result = deriveSkills({
      templateCode: 'short_answer',
      placement: { listeningStage: 'comprehension' },
    });
    expect(result.skills).toEqual(['listening', 'written']);
    expect(result.modality).toBe('production');
  });
});

describe('input and output (plan 64, decision F)', () => {
  const heard = { audio: { enabled: true } };

  it('reads the channels off the pair', () => {
    expect(channelsOf('text', 'none')).toEqual(['reading']);
    expect(channelsOf('audio', 'written_target')).toEqual(['listening', 'written']);
    expect(channelsOf('video', 'none')).toEqual(['listening']);
    // Rule 1, both sides: a prompt or an answer in the language of explanation is
    // real work and not a channel of the language being learnt.
    expect(channelsOf('none', 'written_l1')).toEqual([]);
    expect(channelsOf('image', 'none')).toEqual([]);
    expect(channelsOf('none', 'spoken')).toEqual(['spoken']);
  });

  it('keeps the output of an exercise that stands as a listening stage', () => {
    const result = deriveSkills({ templateCode: 'error_correction', placement: { listeningStage: 'gap_fill' } });
    expect(result.input).toBe('audio');
    expect(result.output).toBe('written_target');
    expect(result.skills).toEqual(['listening', 'written']);
    expect(result.skillSource).toBe('placement');
  });

  it('reads a video placement as video, counted as listening', () => {
    const result = deriveSkills({ templateCode: 'short_answer', placement: { videoQuestion: true } });
    expect(result.input).toBe('video');
    expect(result.skills).toEqual(['listening', 'written']);
  });

  it('keeps written in free mode and reading in bank mode, with or without sound', () => {
    const free = { settings: { input: 'free' } };
    const bank = { settings: { input: 'bank' } };
    expect(deriveSkills({ templateCode: 'word_bank_gap_fill', content: free }).skills).toEqual(['written']);
    expect(deriveSkills({ templateCode: 'word_bank_gap_fill', content: bank }).skills).toEqual(['reading']);
    expect(
      deriveSkills({ templateCode: 'word_bank_gap_fill', content: { ...free, ...heard } }).skills,
    ).toEqual(['listening', 'written']);
    expect(
      deriveSkills({ templateCode: 'word_bank_gap_fill', content: { ...bank, ...heard } }).skills,
    ).toEqual(['listening']);
  });

  it('leaves the author override in charge of the channels, and the shape as built', () => {
    const result = deriveSkills({
      templateCode: 'short_answer',
      content: heard,
      override: { skills: ['spoken'], focus: [], setAt: new Date() },
    });
    expect(result.skills).toEqual(['spoken']);
    expect(result.input).toBe('audio');
    expect(result.output).toBe('written_target');
  });
});

/**
 * The guard the stop-line of plan 64 §0.3 rests on.
 *
 * `modality` rates plan 63's shadow atom cards (`atomEvidenceStrength`), and `form` sits
 * next to it in the attempt event. Phase 6 reshapes the channels and must move neither,
 * in any combination of template, document and placement. Every value below is what
 * the kernel answered before the split. A failure here is not a test to update: it is a
 * change to how memory is rated, and it belongs to decision G2, not to this file.
 */
describe('what the split must not move', () => {
  const documents: Record<string, unknown> = {
    bare: undefined,
    heard: { audio: { enabled: true } },
    silent: { audio: { enabled: false } },
    free: { settings: { input: 'free' } },
    bank: { settings: { input: 'bank' } },
    heardFree: { audio: { enabled: true }, settings: { input: 'free' } },
    heardBank: { audio: { enabled: true }, settings: { input: 'bank' } },
  };
  const placements = [
    undefined,
    { listeningStage: 'gap_fill' as const },
    { videoQuestion: true },
    { lessonKind: 'audio' as const },
    { lessonKind: 'text' as const },
  ];

  const expected: Record<string, [string, string]> = {
    multiple_choice: ['bank', 'recognition'],
    multiple_choice_group: ['bank', 'recognition'],
    fill_in_blank: ['free', 'recall'],
    word_bank_fill: ['bank', 'recognition'],
    text_order: ['bank', 'recognition'],
    error_correction: ['free', 'recall'],
    translate_to_target: ['free', 'production'],
    translate_from_target: ['free', 'recall'],
    match_pairs: ['bank', 'recognition'],
    short_answer: ['free', 'production'],
    writing_task: ['free', 'production'],
    sentence_schema: ['bank', 'recall'],
    some_future_type: ['unknown', 'unknown'],
  };

  // The one template whose document decides — and, with the sound on, does not
  // (frozen until G2, see `fromDocument`).
  const gapFill: Record<string, [string, string]> = {
    bare: ['mixed', 'unknown'],
    heard: ['mixed', 'unknown'],
    silent: ['mixed', 'unknown'],
    free: ['free', 'recall'],
    bank: ['bank', 'recognition'],
    heardFree: ['mixed', 'unknown'],
    heardBank: ['mixed', 'unknown'],
  };

  it('keeps form and modality for every template, document and placement', () => {
    for (const [doc, content] of Object.entries(documents))
      for (const placement of placements) {
        for (const [code, [form, modality]] of Object.entries(expected)) {
          const r = deriveSkills({ templateCode: code, content, placement });
          expect([r.form, r.modality], `${code} ${doc} ${JSON.stringify(placement)}`).toEqual([form, modality]);
        }
        const r = deriveSkills({ templateCode: 'word_bank_gap_fill', content, placement });
        expect([r.form, r.modality], `word_bank_gap_fill ${doc}`).toEqual(gapFill[doc]);
      }
  });
});

describe('read_aloud, three tasks in one type (plan 70 §3.9)', () => {
  const doc = (mode: string, extra: Record<string, unknown> = {}) => ({
    mode,
    prompts: [{ id: 'p1', image: { assetId: '' } }],
    ...extra,
  });

  it('reads aloud: text in, spoken out, recall, pronunciation', () => {
    const p = deriveSkills({ templateCode: 'read_aloud', content: doc('read') });
    expect([p.input, p.output, p.modality, p.form]).toEqual(['text', 'spoken', 'recall', 'free']);
    expect(p.skills).toEqual(['reading', 'spoken']);
    expect(p.focus).toEqual(['pronunciation']);
    expect(p.focusSource).toBe('template');
  });

  it('turns a monologue and a dialogue into production with no subject of their own', () => {
    for (const mode of ['monologue', 'dialogue']) {
      const p = deriveSkills({ templateCode: 'read_aloud', content: doc(mode) });
      expect(p.modality, mode).toBe('production');
      expect(p.modalitySource, mode).toBe('document');
      expect(p.focus, mode).toEqual([]);
      expect(structuralFocus('read_aloud', doc(mode)), mode).toEqual([]);
    }
    expect(structuralFocus('read_aloud', doc('read'))).toEqual(['pronunciation']);
  });

  it('hears a model reading or a partner line as audio', () => {
    const heard = { audio: { enabled: true } };
    expect(deriveSkills({ templateCode: 'read_aloud', content: doc('read', heard) }).input).toBe('audio');
    expect(deriveSkills({ templateCode: 'read_aloud', content: doc('dialogue', heard) }).skills).toEqual([
      'listening',
      'spoken',
    ]);
  });

  it('takes in a picture for a picture monologue, even with a clip on', () => {
    const pictured = doc('monologue', {
      prompts: [{ id: 'p1', image: { assetId: 'img' } }],
      audio: { enabled: true },
    });
    expect(deriveSkills({ templateCode: 'read_aloud', content: pictured }).input).toBe('image');
  });

  it('keeps pronunciation beside the words a reading addresses, and drops it for a monologue', () => {
    const atoms = [{ atomType: 'vocabulary_item', itemKey: 'p1' }];
    expect(deriveSkills({ templateCode: 'read_aloud', content: doc('read'), atoms }).focus).toEqual([
      'vocabulary',
      'pronunciation',
    ]);
    expect(deriveSkills({ templateCode: 'read_aloud', content: doc('monologue'), atoms }).focus).toEqual([
      'vocabulary',
    ]);
  });
});
