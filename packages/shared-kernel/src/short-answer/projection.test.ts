// The security boundary. IMPLEMENTATION.md's checklist row "showModel: 'never' → the
// model answer is absent from the student payload entirely" is the reason this file
// asserts on serialised JSON rather than on fields: an absent field is the claim, and
// only a whole-payload search actually checks it.

import { describe, expect, it } from 'vitest';

import { grade } from './grading.js';
import type { Question, Settings, ShortAnswerContent } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';
import { toContent, toExpectedAnswers } from './persistence.js';
import type { ProjectedSettings } from './projection.js';
import { toStudentProjection, toStudentResult } from './projection.js';

const ANCHOR = 'lykt foran';
const MODEL = 'Alle syklister må ha lykt foran og bak i mørket.';
const WHY = 'Regelen står i første setning.';

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    kind: 'reading',
    passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
    prompt: 'Hva er nytt fra 1. januar?',
    model: MODEL,
    elements: [{ id: 'e1', label: 'Kravet', anchors: [ANCHOR], required: true }],
    why: WHY,
    ...overrides,
  };
}

function document(overrides: Partial<ShortAnswerContent> = {}): ShortAnswerContent {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(overrides.settings ?? {}) };
  return { title: 'Sykkelregler', instruction: 'Svar med egne ord.', questions: [question()], ...overrides, settings };
}

const project = (ex: ShortAnswerContent) => toStudentProjection(toContent(ex), toExpectedAnswers(ex));

describe('what reaches the student', () => {
  it('carries the question and the settings that change what they see', () => {
    const projection = project(document());
    expect(projection.instruction).toBe('Svar med egne ord.');
    expect(projection.questions[0]).toMatchObject({
      id: 'q1',
      kind: 'reading',
      prompt: 'Hva er nytt fra 1. januar?',
      passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
    });
    expect(projection.settings.showBreakdown).toBe(true);
  });

  it('never carries the anchors, the labels or the explanation', () => {
    const serialised = JSON.stringify(project(document()));
    expect(serialised).not.toContain(ANCHOR);
    expect(serialised).not.toContain('Kravet');
    expect(serialised).not.toContain(WHY);
  });

  it('drops a question that has no prompt yet', () => {
    const ex = document({ questions: [question(), question({ id: 'q2', prompt: '  ' })] });
    expect(project(ex).questions.map((q) => q.id)).toEqual(['q1']);
  });
});

describe('the passage, by kind', () => {
  it('shows it for reading', () => {
    expect(project(document()).questions[0]?.passage).toBeDefined();
  });

  it('withholds a listening transcript — it is what the audio says', () => {
    const ex = document({ questions: [question({ kind: 'listening', passage: 'Hei, dette er NRK.' })] });
    const projection = project(ex);
    expect(projection.questions[0]?.passage).toBeUndefined();
    expect(JSON.stringify(projection)).not.toContain('NRK');
  });

  it('withholds a passage left behind by a switch to opinion', () => {
    // The record keeps the text (switching kind does not clear fields); the student is
    // not shown a text the question never mentions.
    const ex = document({ questions: [question({ kind: 'opinion' })] });
    expect(project(ex).questions[0]?.passage).toBeUndefined();
  });
});

describe('showModel', () => {
  it("sends the model answer up front under 'always'", () => {
    // The one case where part of the key must reach the student early — self-study mode.
    // A projection reading only `content` would silently lose this and look correct.
    const ex = document({ settings: { ...DEFAULT_SETTINGS, showModel: 'always' } });
    expect(project(ex).questions[0]?.model).toBe(MODEL);
  });

  it("withholds it under 'onClose' — it arrives with the verdict", () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, showModel: 'onClose' } });
    expect(JSON.stringify(project(ex))).not.toContain('Alle syklister');
  });

  it("withholds it under 'never'", () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, showModel: 'never' } });
    expect(JSON.stringify(project(ex))).not.toContain('Alle syklister');
  });

  it('omits an empty model answer rather than sending a blank field', () => {
    const ex = document({
      questions: [question({ model: '  ' })],
      settings: { ...DEFAULT_SETTINGS, showModel: 'always' },
    });
    expect(project(ex).questions[0]?.model).toBeUndefined();
  });
});

describe('projecting twice', () => {
  it('survives a content column whose key has already been stripped', () => {
    // Plan 51 §6.3: content-service projects and nulls the key, then start-attempt
    // projects again. The second run must not throw and must not resurrect anything.
    const once = toStudentProjection(toContent(document()), null);
    const twice = toStudentProjection(once, null);
    expect(twice.questions.map((q) => q.id)).toEqual(['q1']);
    expect(twice.questions[0]?.prompt).toBe('Hva er nytt fra 1. januar?');
  });

  it("does not go looking for a model answer that is no longer there under 'always'", () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, showModel: 'always' } });
    const stripped = toStudentProjection(toContent(ex), null);
    expect(stripped.questions[0]?.model).toBeUndefined();
    expect(stripped.settings.showModel).toBe('always');
  });
});

describe('toStudentResult', () => {
  const q = question();
  const settings = (overrides: Partial<ProjectedSettings> = {}): ProjectedSettings => ({
    passRule: 'all',
    passN: 2,
    minWords: 3,
    showBreakdown: true,
    showModel: 'onClose',
    aiStage: false,
    aiGrammar: true,
    teacherReview: 'flagged',
    progress: true,
    ...overrides,
  });

  const graded = (text: string) => {
    const result = grade(q, text, DEFAULT_SETTINGS);
    return { questionId: q.id, ...result, why: q.why, model: q.model };
  };

  it('reports the verdict, the coverage and the explanation', () => {
    const result = toStudentResult(graded(MODEL), settings());
    expect(result).toMatchObject({ questionId: 'q1', verdict: 'pass', covered: 1, total: 1, tooShort: false, why: WHY });
  });

  it('gives the labels and a hit flag, never the phrase that matched', () => {
    // The anchor is dropped here rather than hidden by a component: a breakdown carrying
    // it would hand the student the key one question at a time.
    const result = toStudentResult(graded(MODEL), settings());
    expect(result.hits).toEqual([{ id: 'e1', label: 'Kravet', required: true, hit: true }]);
    // Only the breakdown is checked, not the whole payload: the model answer legitimately
    // contains the anchor — that is what modelPasses requires of it — and it ships here
    // under `showModel: 'onClose'`.
    expect(JSON.stringify(result.hits)).not.toContain(ANCHOR);
  });

  it('sends no breakdown at all when showBreakdown is off', () => {
    const result = toStudentResult(graded(MODEL), settings({ showBreakdown: false }));
    expect(result.hits).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Kravet');
  });

  it('reports a too-short answer', () => {
    const result = toStudentResult(graded('Lykt foran'), settings());
    expect(result.tooShort).toBe(true);
    expect(result.verdict).toBe('partial');
  });

  it("includes the model answer under 'onClose'", () => {
    expect(toStudentResult(graded(MODEL), settings()).model).toBe(MODEL);
  });

  it("withholds it under 'never'", () => {
    const result = toStudentResult(graded(MODEL), settings({ showModel: 'never' }));
    expect(result.model).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('Alle syklister');
  });
});
