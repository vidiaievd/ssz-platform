import { describe, expect, it } from 'vitest';

import type { Item, Translate } from './model.js';
import { DEFAULT_AI, DEFAULT_CHECK, DEFAULT_FLOW } from './model.js';
import {
  dirForCode,
  fromPersisted,
  isTranslateCode,
  readAnswers,
  readContent,
  readSubmission,
  templateCode,
  toContent,
  toExpectedAnswers,
  toSubmission,
} from './persistence.js';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    dir: 'to_target',
    source: 'Я живу в Тромсё.',
    refs: ['Jeg bor i Tromsø.'],
    gloss: [],
    require: [],
    forbid: [],
    ...overrides,
  };
}

function exercise(items: Item[] = [item()]): Translate {
  return {
    id: 'ex1',
    type: 'translate_to_target',
    moduleId: 'm1',
    title: 'Oversettelse',
    instructions: 'Oversett til norsk.',
    updatedAt: '2026-08-13T10:00:00.000Z',
    dir: 'to_target',
    langs: { explain: 'Russisk', target: 'Norsk' },
    format: 'set',
    note: 'Fra leksjon 4.',
    items,
    check: { ...DEFAULT_CHECK },
    flow: { ...DEFAULT_FLOW },
    ai: { ...DEFAULT_AI, checks: { ...DEFAULT_AI.checks } },
  };
}

const envelope = {
  id: 'ex1',
  moduleId: 'm1',
  title: 'Oversettelse',
  instructions: 'Oversett til norsk.',
  updatedAt: '2026-08-13T10:00:00.000Z',
};

describe('the content / expectedAnswers split', () => {
  // The rule the whole file exists for: nothing a student receives may contain the key.
  it('keeps every answer out of the content column', () => {
    const ex = exercise([
      item({
        refs: ['Jeg bor i Tromsø.'],
        require: [{ text: 'bor' }],
        forbid: [{ text: 'bodde' }],
        explanation: 'Presens, ikke preteritum.',
        teacherNote: 'Vanlig feil.',
        hint: 'presens',
      }),
    ]);

    const serialised = JSON.stringify(toContent(ex));

    expect(serialised).not.toContain('Tromsø.');
    expect(serialised).not.toContain('bodde');
    expect(serialised).not.toContain('Presens, ikke preteritum.');
    expect(serialised).not.toContain('Vanlig feil.');
    expect(serialised).toContain('presens'); // the hint is written for the student
  });

  it('keys the answers by item id, so reordering items cannot shuffle them', () => {
    const answers = toExpectedAnswers(exercise([item({ id: 'a' }), item({ id: 'b', refs: ['Vi drar.'] })]));

    expect(Object.keys(answers.items)).toEqual(['a', 'b']);
    expect(answers.items['b']?.refs).toEqual(['Vi drar.']);
  });

  it('drops blank keys, guards and optional strings on the way out', () => {
    const answers = toExpectedAnswers(
      exercise([item({ refs: ['Jeg bor i Tromsø.', '  '], require: [{ text: ' ' }], explanation: '' })]),
    );

    expect(answers.items['i1']).toEqual({ refs: ['Jeg bor i Tromsø.'], require: [], forbid: [] });
  });

  it('round-trips a document through both columns', () => {
    const ex = exercise([
      item({
        hint: 'presens',
        gloss: [{ w: 'уже', t: 'allerede' }],
        mediaId: 'media-1',
        require: [{ text: 'bor', note: 'Presens.' }],
        explanation: 'Fordi det gjelder nå.',
        teacherNote: 'Se over ordstillingen.',
      }),
    ]);

    expect(fromPersisted(envelope, 'translate_to_target', toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });
});

describe('reading untrusted columns', () => {
  it('does not throw on anything, and fills the defaults', () => {
    const content = readContent(null);

    expect(content.items).toEqual([]);
    expect(content.check).toEqual(DEFAULT_CHECK);
    expect(content.flow).toEqual(DEFAULT_FLOW);
    expect(content.langs).toEqual({ explain: 'Russisk', target: 'Norsk' });
    expect(readAnswers(undefined).items).toEqual({});
  });

  it('takes the direction from the template code when the content carries none', () => {
    expect(readContent({}, 'translate_from_target').dir).toBe('from_target');
    expect(readContent({ dir: 'both' }, 'translate_from_target').dir).toBe('both');
  });

  it('clamps a stored self-check budget and a stored threshold into range', () => {
    const content = readContent({ flow: { selfCheck: 50 }, check: { near: 0 } });

    expect(content.flow.selfCheck).toBe(5);
    expect(content.check.near).toBe(0.5);
  });

  it('treats a non-positive replay limit as unlimited', () => {
    expect(readContent({ flow: { replayLimit: 0 } }).flow.replayLimit).toBeNull();
    expect(readContent({ flow: { replayLimit: 3 } }).flow.replayLimit).toBe(3);
  });

  it('still reads guards stored as plain strings, as the handoff wrote them', () => {
    const answers = readAnswers({ items: { i1: { refs: ['x'], require: ['har bodd', '  '] } } });

    expect(answers.items['i1']?.require).toEqual([{ text: 'har bodd' }]);
  });

  it('leaves a missing answer row as an item with no key, which issues.ts blocks on', () => {
    const ex = fromPersisted(envelope, 'translate_to_target', toContent(exercise()), { items: {} });

    expect(ex.items[0]?.refs).toEqual([]);
  });
});

describe('submissions', () => {
  it('reads the wire shape and a bare array alike', () => {
    const wire = { answers: [{ itemId: 'a', text: 'Jeg bor her' }] };

    expect(readSubmission(wire)).toEqual({ a: 'Jeg bor her' });
    expect(readSubmission(wire.answers)).toEqual({ a: 'Jeg bor her' });
    expect(readSubmission('nonsense')).toEqual({});
  });

  it('writes one entry per item, including the ones left blank', () => {
    expect(toSubmission([{ id: 'a' }, { id: 'b' }], { a: 'Jeg bor her' })).toEqual([
      { itemId: 'a', text: 'Jeg bor her' },
      { itemId: 'b', text: '' },
    ]);
  });
});

describe('template codes', () => {
  it('stores a mixed set under the to-target code', () => {
    expect(templateCode('both')).toBe('translate_to_target');
    expect(templateCode('from_target')).toBe('translate_from_target');
    expect(dirForCode('translate_from_target')).toBe('from_target');
  });

  it('recognises its own codes and nothing else', () => {
    expect(isTranslateCode('translate_to_target')).toBe(true);
    expect(isTranslateCode('error_correction')).toBe(false);
  });
});
