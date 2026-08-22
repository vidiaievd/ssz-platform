// README §"Validation rules" — every blocker, every warning, every audit flag, and the
// rail dots that filter them.

import { describe, expect, it } from 'vitest';

import { audit, blockers, isReady, issues, stepState, warnings } from './issues.js';
import type { IssueCode } from './issues.js';
import type { KeyElement, Question, Settings, ShortAnswerContent } from './model.js';
import { DEFAULT_SETTINGS } from './model.js';

function element(id: string, label: string, anchors: string[], required = true): KeyElement {
  return { id, label, anchors, required };
}

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    kind: 'reading',
    passage: 'Fra 1. januar må alle som sykler i mørket ha lys både foran og bak.',
    prompt: 'Hva er nytt fra 1. januar?',
    model: 'Alle syklister må ha lys foran og bak når de sykler i mørket.',
    elements: [
      element('e1', 'Kravet', ['lys foran', 'foran og bak']),
      element('e2', 'Når det gjelder', ['i mørket', 'når det er mørkt']),
    ],
    why: 'Teksten sier både hva regelen krever og når den gjelder.',
    ...overrides,
  };
}

function document(overrides: Partial<ShortAnswerContent> = {}): ShortAnswerContent {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(overrides.settings ?? {}) };
  return { title: 'Sykkelregler', instruction: '', questions: [question()], ...overrides, settings };
}

const codes = (list: { code: IssueCode }[]) => list.map((i) => i.code);

describe('a complete document', () => {
  it('has no issues at all and is ready', () => {
    expect(issues(document())).toEqual([]);
    expect(isReady(document())).toBe(true);
  });
});

describe('step 1 blockers', () => {
  it('flags a document with no questions', () => {
    expect(codes(blockers(document({ questions: [] })))).toContain('EX_NO_QUESTIONS');
  });

  it('flags a question with no prompt', () => {
    const ex = document({ questions: [question({ prompt: '  ' })] });
    expect(codes(blockers(ex))).toContain('Q_NO_PROMPT');
  });

  it('does not also demand a model answer for a question with no prompt', () => {
    // Two blockers on one blank card would say nothing the first does not.
    const ex = document({ questions: [question({ prompt: '', model: '' })] });
    expect(codes(blockers(ex))).not.toContain('Q_NO_MODEL');
  });

  it('flags a written question with no model answer', () => {
    const ex = document({ questions: [question({ model: '' })] });
    expect(codes(blockers(ex))).toContain('Q_NO_MODEL');
  });

  it('names the question it is about', () => {
    const ex = document({ questions: [question({ id: 'second', prompt: '' })] });
    expect(blockers(ex)[0]).toMatchObject({ code: 'Q_NO_PROMPT', questionId: 'second' });
  });
});

describe('step 1 passage warning', () => {
  it('warns when a reading question has no passage', () => {
    const ex = document({ questions: [question({ passage: '' })] });
    expect(codes(warnings(ex))).toContain('Q_NO_PASSAGE');
  });

  it('says nothing for listening — the transcript is optional', () => {
    const ex = document({ questions: [question({ kind: 'listening', passage: '' })] });
    expect(codes(warnings(ex))).not.toContain('Q_NO_PASSAGE');
  });

  it('says nothing for opinion — there is no passage field', () => {
    const ex = document({
      questions: [
        question({
          kind: 'opinion',
          passage: '',
          prompt: 'Ville du syklet om vinteren?',
          model: 'Nei, fordi veiene er glatte om vinteren.',
          elements: [element('e1', 'Begrunnelse', ['fordi', 'siden'])],
        }),
      ],
    });
    expect(codes(warnings(ex))).not.toContain('Q_NO_PASSAGE');
  });
});

describe('step 2 blockers', () => {
  it('flags a question with no usable key', () => {
    const ex = document({ questions: [question({ elements: [element('e1', 'Kravet', [])] })] });
    expect(codes(blockers(ex))).toContain('Q_NO_KEY');
  });

  it('flags a model answer that does not pass its own key, with the coverage', () => {
    const ex = document({ questions: [question({ elements: [element('e1', 'Kravet', ['refleksvest'])] })] });
    expect(blockers(ex)[0]).toMatchObject({ code: 'Q_MODEL_FAILS_KEY', covered: 0, total: 1 });
  });

  it('does not raise the failing-key blocker on a question with no key yet', () => {
    // One blocker per problem: "no key" already says everything "does not pass" would.
    const ex = document({ questions: [question({ elements: [] })] });
    expect(codes(blockers(ex))).toEqual(['Q_NO_KEY']);
  });

  it('does not raise it before a model answer exists', () => {
    const ex = document({ questions: [question({ model: '' })] });
    expect(codes(blockers(ex))).not.toContain('Q_MODEL_FAILS_KEY');
  });
});

describe('the key audit', () => {
  const auditOf = (q: Question) => codes(audit(q, document({ questions: [q] })));

  it('warns about a labelled element with no phrase', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['lys foran']), element('e2', 'Formålet', [])] });
    expect(auditOf(q)).toContain('EL_NO_ANCHOR');
  });

  it('warns when the only phrase is missing from the model answer', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['refleksvest'])] });
    expect(audit(q, document({ questions: [q] }))).toContainEqual({
      code: 'EL_ANCHOR_NOT_IN_MODEL',
      level: 'warning',
      step: 2,
      questionId: 'q1',
      elementId: 'e1',
      anchor: 'refleksvest',
    });
  });

  it('stays quiet about a variant missing from the model answer', () => {
    // Variants exist precisely so that a student can word it differently from the author.
    const q = question({ elements: [element('e1', 'Kravet', ['lys foran', 'refleksvest'])] });
    expect(auditOf(q)).not.toContain('EL_ANCHOR_NOT_IN_MODEL');
  });

  it('notes a one-word phrase of three characters or fewer', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['lys', 'lys foran'])] });
    expect(auditOf(q)).toContain('EL_ANCHOR_TOO_SHORT');
  });

  it('does not note a two-word phrase of the same length', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['lys foran'])] });
    expect(auditOf(q)).not.toContain('EL_ANCHOR_TOO_SHORT');
  });

  it('notes an element carrying a single variant', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['lys foran'])] });
    expect(auditOf(q)).toContain('EL_ONE_ANCHOR');
  });

  it('warns when more than four elements are labelled', () => {
    const q = question({
      elements: [1, 2, 3, 4, 5].map((n) => element(`e${n}`, `Punkt ${n}`, ['lys foran', 'foran og bak'])),
    });
    expect(audit(q, document({ questions: [q] }))).toContainEqual({
      code: 'Q_TOO_MANY_ELEMENTS',
      level: 'warning',
      step: 2,
      questionId: 'q1',
      count: 5,
    });
  });

  it('counts half-written elements towards that limit', () => {
    // They are labelled, so they read as elements on the card even though they never grade.
    const q = question({ elements: [1, 2, 3, 4, 5].map((n) => element(`e${n}`, `Punkt ${n}`, [])) });
    expect(auditOf(q)).toContain('Q_TOO_MANY_ELEMENTS');
  });
});

describe('step 3', () => {
  it('blocks a question with no explanation', () => {
    const ex = document({ questions: [question({ why: '  ' })] });
    expect(blockers(ex)[0]).toMatchObject({ code: 'Q_NO_WHY', questionId: 'q1' });
  });

  it('warns when passN asks for more elements than a question has', () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, passRule: 'n', passN: 3 } });
    expect(warnings(ex)).toContainEqual({ code: 'PASS_N_TOO_HIGH', level: 'warning', step: 3, passN: 3 });
  });

  it('says nothing about passN while the rule is all', () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, passRule: 'all', passN: 3 } });
    expect(codes(warnings(ex))).not.toContain('PASS_N_TOO_HIGH');
  });
});

describe('step 4', () => {
  it('warns that nobody reads the answers', () => {
    const ex = document({ settings: { ...DEFAULT_SETTINGS, teacherReview: 'none' } });
    expect(warnings(ex)).toContainEqual({ code: 'NO_TEACHER_REVIEW', level: 'warning', step: 4 });
    expect(isReady(ex)).toBe(true);
  });
});

describe('stepState', () => {
  it('is empty on step 1 while no question has been written', () => {
    const ex = document({ questions: [question({ prompt: '', model: '', why: 'x', elements: [] })] });
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 1 });
    expect(stepState(ex, 4)).toEqual({ s: 'ok', errs: 0 });
  });

  it('never reports empty — both ways to get there are blockers', () => {
    // Documented on StepStatus: the state exists in README's contract but the `err`
    // branch answers first in both cases, so no rail dot ever renders it.
    const noQuestions = document({ questions: [] });
    expect(stepState(noQuestions, 1)).toEqual({ s: 'err', errs: 1 });

    const unwritten = document({
      questions: [{ id: 'q1', kind: 'opinion', passage: '', prompt: '', model: '', elements: [], why: 'x' }],
    });
    expect(stepState(unwritten, 1)).toEqual({ s: 'err', errs: 1 });
  });

  it('counts blockers per step', () => {
    const ex = document({ questions: [question({ prompt: '' }), question({ id: 'q2', prompt: '' })] });
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 2 });
  });

  it('is warn when only warnings remain', () => {
    const ex = document({ questions: [question({ passage: '' })] });
    expect(stepState(ex, 1)).toEqual({ s: 'warn', errs: 0 });
  });

  it('ignores info-level audit notes', () => {
    const ex = document({ questions: [question({ elements: [element('e1', 'Kravet', ['lys foran'])] })] });
    expect(codes(issues(ex))).toContain('EL_ONE_ANCHOR');
    expect(stepState(ex, 2)).toEqual({ s: 'ok', errs: 0 });
  });
});
