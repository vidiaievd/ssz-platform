// SPEC_api_contract §2 and the storage split — AC-S10, AC-S11 (structural half).

import { describe, expect, it } from 'vitest';

import { exercise } from './fixtures.test-support.js';
import { emptyContent } from './model.js';
import { fromPersisted, toContent, toExpectedAnswers } from './persistence.js';
import { instructionFor, packFor } from './presets.js';
import { toStudentProjection } from './projection.js';

const columns = (ex = exercise()) => [toContent(ex), toExpectedAnswers(ex)] as const;

describe('persistence', () => {
  it('round-trips the authored document', () => {
    const ex = { ...exercise(), orphans: [{ id: 'o', qid: 'q1', surface: 'gikk', why: 'w' }] };
    expect(fromPersisted(...columns(ex))).toEqual(ex);
  });

  it('keeps every answer out of the content column', () => {
    const content = JSON.stringify(toContent({ ...exercise(), orphans: [{ id: 'o', qid: 'q1', surface: 'gikk', why: 'w' }] }));
    for (const key of ['spans', 'why', 'missHint', 'fpHint', 'orphans', 'start', 'end']) {
      expect(content).not.toContain(`"${key}"`);
    }
  });

  it('drops an orphan whose question is gone (AC-A6)', () => {
    const ex = { ...exercise(), orphans: [{ id: 'o', qid: 'gone', surface: 'x', why: '' }] };
    expect(fromPersisted(...columns(ex)).orphans).toEqual([]);
  });

  it('does not throw on garbage, and fills the defaults', () => {
    const ex = fromPersisted('nope', [1, 2]);
    expect(ex).toMatchObject({ title: '', text: '', questions: [], orphans: [] });
    expect(ex.settings).toEqual(emptyContent().settings);
  });
});

describe('toStudentProjection', () => {
  it('AC-S11: carries no key, no hint, no threshold, no penalty, no orphan — structurally', () => {
    const p = toStudentProjection(...columns({ ...exercise(), orphans: [{ id: 'o', qid: 'q1', surface: 'gikk', why: 'w' }] }));
    expect(Object.keys(p).sort()).toEqual(['instruction', 'paragraphs', 'questions', 'settings', 'text']);
    for (const q of p.questions) expect(Object.keys(q).sort()).toEqual(['count', 'id', 'prompt', 'unit']);
    expect(Object.keys(p.settings).sort()).toEqual(['attempts', 'hints', 'revealKey']);
  });

  it('AC-S10: count is null unless showCount, and the number of spans when it is', () => {
    expect(toStudentProjection(...columns()).questions.map((q) => q.count)).toEqual([null, null]);
    const shown = exercise({ settings: { ...exercise().settings, showCount: true } });
    expect(toStudentProjection(...columns(shown)).questions.map((q) => q.count)).toEqual([8, 6]);
  });

  it('sends only ready questions', () => {
    const ex = exercise();
    const unready = { ...ex, questions: [{ ...ex.questions[0]!, spans: [] }, { ...ex.questions[1]!, prompt: ' ' }] };
    expect(toStudentProjection(...columns(unready)).questions).toEqual([]);
  });

  it('gets no question from a key column it cannot read', () => {
    expect(toStudentProjection(toContent(exercise()), {}).questions).toEqual([]);
  });

  it('sends the paragraph ranges of the passage', () => {
    const ex = exercise();
    const p = toStudentProjection(...columns(ex));
    expect(p.paragraphs).toHaveLength(2);
    expect(ex.text.slice(...p.paragraphs[1]!)).toMatch(/^Vi bodde.*sommer\.$/);
  });
});

describe('presets', () => {
  it('gives the Norwegian instruction for nb, nn and no, by region code too', () => {
    expect(instructionFor('nb')).toBe('Les teksten og marker det oppgaven spør om.');
    expect(instructionFor('nn-NO')).toBe(instructionFor('nb'));
  });

  it('gives nothing for a language without a pack, and the blank document stays non-Norwegian', () => {
    expect(packFor('xx')).toBeNull();
    expect(instructionFor('xx')).toBe('');
    expect(JSON.stringify(emptyContent(instructionFor('xx')))).not.toMatch(/marker|teksten/i);
  });
});
