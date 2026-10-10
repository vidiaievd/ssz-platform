// The two columns, the projection and the memory filter (plan 73 §3.1, §3.2, §3.9).

import { describe, expect, it } from 'vitest';

import { setAnswering, setScoring, setSourceKind } from './edits.js';
import { SAMPLE_FIELD_IDS, sampleContent } from './fixture.js';
import {
  cellAtomsForMemory,
  practicedAtomsForMemory,
  skillAtomId,
  skillAtoms,
} from './memory.js';
import { emptyContent } from './model.js';
import { fromPersisted, toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection, withGradedSettings } from './projection.js';

const [DATO, KLOKKE, , , , NAVN] = SAMPLE_FIELD_IDS;
const project = (ex = sampleContent()) => toStudentProjection(toContent(ex), toExpectedAnswers(ex));

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('persistence (INF-M1, INF-M2)', () => {
  it('round-trips the sample', () => {
    const ex = sampleContent();
    expect(fromPersisted(toContent(ex), toExpectedAnswers(ex))).toEqual(ex);
  });

  it('keeps the key out of `content`', () => {
    const keys = keysDeep(toContent(sampleContent()));
    for (const k of ['expected', 'why']) expect(keys.has(k), k).toBe(false);
  });

  it('writes `audio.enabled` from the source switch', () => {
    const ex = sampleContent();
    expect(toContent(ex).audio.enabled).toBe(true);
    expect(toContent(setSourceKind(ex, 'text')).audio.enabled).toBe(false);
    expect(toContent({ ...ex, audio: { ...ex.audio, enabled: false } }).audio.enabled).toBe(true);
  });

  it('reads anything without throwing', () => {
    expect(fromPersisted(null, 7)).toEqual({ ...emptyContent(''), fields: [] });
    const odd = fromPersisted(
      { sourceKind: 'video', fields: [{ id: 'a', type: 'colour' }, { label: 'no id' }], answering: { attempts: 7, hintsAfter: 2 }, scoring: { passPct: 400 } },
      { fields: { a: { expected: ['x', 3], why: 1 } } },
    );
    expect(odd.sourceKind).toBe('text');
    expect(odd.fields).toHaveLength(1);
    expect(odd.fields[0]).toMatchObject({ type: 'word', expected: ['x'], why: '' });
    expect(odd.answering).toMatchObject({ attempts: 2, hintsAfter: 1 });
    expect(odd.scoring.passPct).toBe(100);
  });
});

describe('the student projection (INF-M12)', () => {
  it('carries no key, no reason, no pass mark and no setting that is not drawn', () => {
    const keys = keysDeep(project());
    for (const k of ['expected', 'why', 'passPct', 'grading', 'scoring', 'required', 'focus', 'memory']) {
      expect(keys.has(k), k).toBe(false);
    }
  });

  it('only ready cells, with the pack’s placeholder and the keyboard', () => {
    const p = project();
    expect(p.fields.map((f) => f.id)).toEqual([...SAMPLE_FIELD_IDS]);
    expect(p.fields.find((f) => f.id === KLOKKE)).toMatchObject({ placeholder: 'kl.', numeric: true });
    expect(p.fields.find((f) => f.id === DATO)).toMatchObject({ placeholder: 'dag og måned', numeric: false });
    expect(p.fields.find((f) => f.id === NAVN)).toMatchObject({ placeholder: '', numeric: false });
    const unready = sampleContent();
    unready.fields[0]!.why = '';
    expect(project(unready).fields.map((f) => f.id)).not.toContain(DATO);
  });

  it('a hint only when it is printed from the start', () => {
    expect(project().fields.some((f) => f.hint !== undefined)).toBe(false);
    const fromStart = project(setAnswering(sampleContent(), { hintsAfter: 0 }));
    expect(fromStart.fields.find((f) => f.id === DATO)?.hint).toBe('Dag og måned');
  });

  it('the passage only for a text source', () => {
    expect(project().passage).toBeUndefined();
    expect(project(setSourceKind(sampleContent(), 'text')).passage).toMatch(/NORSKKURS/);
  });

  it('a graded delivery: one check, no key, no late hints', () => {
    const graded = withGradedSettings(project()) as { answering: Record<string, unknown> };
    expect(graded.answering).toMatchObject({ attempts: 1, revealKey: 'never', hintsAfter: 9 });
    const printed = withGradedSettings(project(setAnswering(sampleContent(), { hintsAfter: 0 }))) as {
      answering: Record<string, unknown>;
    };
    expect(printed.answering['hintsAfter']).toBe(0);
  });
});

describe('memory (INF-D5, INF-S11, INF-S12)', () => {
  const word = { atomType: 'vocabulary_item', atomId: 'w1' };
  const rule = { atomType: 'grammar_rule_atom', atomId: 'g1' };

  it('the skill atom by source and language', () => {
    expect(skillAtomId(sampleContent('audio'))).toBe('nb:selective_listening');
    expect(skillAtomId(sampleContent('text'))).toBe('nb:selective_reading');
    expect(skillAtomId({ language: 'uk-UA', sourceKind: 'audio' })).toBe('uk:selective_listening');
    expect(skillAtoms(sampleContent())).toEqual([{ atomType: 'skill', atomId: 'nb:selective_listening' }]);
    expect(skillAtoms(setScoring(sampleContent(), { memory: 'none' }))).toEqual([]);
  });

  it('words only under «skill + words», and only on a word or name cell', () => {
    const skill = sampleContent();
    const both = setScoring(skill, { memory: 'skill+words' });
    expect(cellAtomsForMemory(skill, NAVN, [word, rule])).toEqual([rule]);
    expect(cellAtomsForMemory(both, NAVN, [word, rule])).toEqual([word, rule]);
    expect(cellAtomsForMemory(both, KLOKKE, [word, rule])).toEqual([rule]);
    expect(practicedAtomsForMemory(skill, [word, rule], new Set(['w1']))).toEqual([rule]);
    expect(practicedAtomsForMemory(both, [word, rule], new Set(['w1']))).toEqual([word, rule]);
    expect(practicedAtomsForMemory(both, [word, rule], new Set())).toEqual([rule]);
  });
});
