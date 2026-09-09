// The IMPLEMENTATION.md test checklist, plus the verdict table from README.

import { describe, expect, it } from 'vitest';

import { coverage, grade, gradeAttempt, gradeableQuestions, modelPasses, usableElements } from './grading.js';
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
      element('e1', 'Kravet: lys foran og bak', ['lys foran', 'foran og bak']),
      element('e2', 'Gjelder når det er mørkt', ['i mørket', 'når det er mørkt']),
    ],
    why: 'Teksten sier både hva regelen krever og når den gjelder.',
    ...overrides,
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function document(overrides: Partial<ShortAnswerContent> = {}): ShortAnswerContent {
  return { title: 'Sykkelregler', instruction: '', questions: [question()], settings: settings(), ...overrides };
}

describe('usableElements', () => {
  it('drops an element with no label', () => {
    const q = question({ elements: [element('e1', '   ', ['lys foran'])] });
    expect(usableElements(q)).toHaveLength(0);
  });

  it('drops an element whose only anchor is whitespace', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['  '])] });
    expect(usableElements(q)).toHaveLength(0);
  });

  it('keeps the half-written element on the document all the same', () => {
    // Plan 51 §6.4: the author may walk away mid-sentence. Filtering happens at grading
    // time, never at save time.
    const q = question({ elements: [element('e1', 'Kravet', [])] });
    expect(q.elements).toHaveLength(1);
    expect(usableElements(q)).toHaveLength(0);
  });
});

describe('grade — verdicts', () => {
  it('passes an answer covering every required element', () => {
    const res = grade(question(), 'Syklistene må ha lys foran og bak i mørket.', settings());
    expect(res.verdict).toBe('pass');
    expect(res.covered).toBe(2);
    expect(res.total).toBe(2);
    expect(res.need).toBe(2);
  });

  it('reports which phrase matched each element', () => {
    const res = grade(question(), 'Man må ha lys foran når det er mørkt.', settings());
    expect(res.hits.map((h) => h.anchor)).toEqual(['lys foran', 'når det er mørkt']);
  });

  it('is partial when only some required elements are covered', () => {
    const res = grade(question(), 'Alle syklister må ha lys foran og bak.', settings());
    expect(res.verdict).toBe('partial');
    expect(res.covered).toBe(1);
  });

  it('fails when nothing is covered', () => {
    const res = grade(question(), 'Jeg vet ikke hva teksten handler om.', settings());
    expect(res.verdict).toBe('fail');
    expect(res.covered).toBe(0);
  });

  it('fails an empty answer without flagging it as too short', () => {
    const res = grade(question(), '', settings({ minWords: 3 }));
    expect(res.verdict).toBe('fail');
    expect(res.tooShort).toBe(false);
    expect(res.words).toBe(0);
  });
});

describe('grade — passRule', () => {
  it("'n' needs only passN of the required elements", () => {
    const res = grade(question(), 'Alle må ha lys foran.', settings({ passRule: 'n', passN: 1 }));
    expect(res.need).toBe(1);
    expect(res.verdict).toBe('pass');
  });

  it('caps passN at the number of required elements the question has', () => {
    // The checklist's "passN greater than a question's element count" case: a question
    // with two elements cannot be made unpassable by asking for three.
    const res = grade(question(), 'Lys foran og bak i mørket.', settings({ passRule: 'n', passN: 3 }));
    expect(res.need).toBe(2);
    expect(res.verdict).toBe('pass');
  });
});

describe('grade — optional elements', () => {
  const q = question({
    elements: [
      element('e1', 'Kravet', ['lys foran']),
      element('e2', 'Formålet', ['færre ulykker'], false),
    ],
  });

  it('never counts towards covered or need', () => {
    const res = grade(q, 'Alle må ha lys foran i mørket.', settings());
    expect(res.covered).toBe(1);
    expect(res.total).toBe(1);
    expect(res.need).toBe(1);
    expect(res.verdict).toBe('pass');
  });

  it('still appears in the breakdown', () => {
    const res = grade(q, 'Alle må ha lys foran, så det blir færre ulykker.', settings());
    expect(res.hits).toHaveLength(2);
    expect(res.hits[1]).toMatchObject({ id: 'e2', required: false, anchor: 'færre ulykker' });
  });

  it('cannot pass a key made only of optional elements', () => {
    // README's `requiredCount > 0` rule. The same key fails modelPasses, which issues.ts
    // raises as a step-2 blocker — so an author cannot ship one.
    const optionalOnly = question({ elements: [element('e1', 'Kravet', ['lys foran'], false)] });
    expect(grade(optionalOnly, 'Alle må ha lys foran i mørket.', settings()).verdict).toBe('fail');
  });
});

describe('grade — minWords', () => {
  it('caps a covering answer at partial when it is too short', () => {
    // The checklist's "one word with minWords: 3 → partial, never pass".
    const single = question({ elements: [element('e1', 'Standpunkt', ['nei'])] });
    const res = grade(single, 'Nei', settings({ minWords: 3 }));
    expect(res.tooShort).toBe(true);
    expect(res.verdict).toBe('partial');
  });

  it('leaves a short answer covering nothing at fail', () => {
    const res = grade(question(), 'Vet ikke', settings({ minWords: 3 }));
    expect(res.tooShort).toBe(true);
    expect(res.verdict).toBe('fail');
  });

  it('is off at minWords: 0', () => {
    const single = question({ elements: [element('e1', 'Standpunkt', ['nei'])] });
    const res = grade(single, 'Nei', settings({ minWords: 0 }));
    expect(res.tooShort).toBe(false);
    expect(res.verdict).toBe('pass');
  });
});

describe('modelPasses', () => {
  it('is true when the author answers their own key', () => {
    expect(modelPasses(question(), settings())).toBe(true);
  });

  it('is false when an anchor does not appear in the model answer', () => {
    const q = question({ elements: [element('e1', 'Kravet', ['refleksvest'])] });
    expect(modelPasses(q, settings())).toBe(false);
  });

  it('is false when no model answer is written yet', () => {
    expect(modelPasses(question({ model: '   ' }), settings())).toBe(false);
  });

  it('follows the same settings the student is graded by', () => {
    const q = question({
      model: 'Alle må ha lys foran og bak.',
      elements: [element('e1', 'Kravet', ['lys foran'])],
    });
    expect(modelPasses(q, settings({ minWords: 12 }))).toBe(false);
    expect(modelPasses(q, settings({ minWords: 3 }))).toBe(true);
  });
});

describe('gradeableQuestions', () => {
  it('keeps only questions with a prompt, a model answer and a usable key', () => {
    const ex = document({
      questions: [
        question({ id: 'ok' }),
        question({ id: 'noPrompt', prompt: '' }),
        question({ id: 'noModel', model: '' }),
        question({ id: 'noKey', elements: [element('e1', '', [])] }),
      ],
    });
    expect(gradeableQuestions(ex).map((q) => q.id)).toEqual(['ok']);
  });
});

describe('coverage', () => {
  it('counts model answers that pass, over every question, and the phrases', () => {
    const ex = document({
      questions: [question({ id: 'a' }), question({ id: 'b', elements: [element('e1', 'Kravet', ['refleksvest'])] })],
    });
    expect(coverage(ex)).toEqual({ done: 1, total: 2, anchors: 5 });
  });
});

describe('gradeAttempt', () => {
  const ex = document({
    questions: [
      question({ id: 'q1' }),
      question({
        id: 'q2',
        prompt: 'Hvorfor kom regelen?',
        model: 'Kommunen vil at færre ulykker skal skje.',
        elements: [element('e3', 'Formålet', ['færre ulykker'])],
        why: 'Formålet står i siste setning.',
      }),
    ],
  });

  it('scores over elements, not over questions', () => {
    // Two of q1's elements and none of q2's: 2 of 3 required elements, not "one of two
    // questions". The distinction is the reason the score is computed here.
    const out = gradeAttempt(ex, [
      { questionId: 'q1', text: 'Alle må ha lys foran og bak når det er mørkt.' },
      { questionId: 'q2', text: 'Jeg vet ikke.' },
    ]);
    expect(out.covered).toBe(2);
    expect(out.total).toBe(3);
    expect(out.score).toBe(67);
    expect(out.correct).toBe(false);
  });

  it('is correct only when every answered question passes', () => {
    const out = gradeAttempt(ex, [
      { questionId: 'q1', text: 'Alle må ha lys foran og bak når det er mørkt.' },
      { questionId: 'q2', text: 'Kommunen vil ha færre ulykker om vinteren.' },
    ]);
    expect(out.correct).toBe(true);
    expect(out.score).toBe(100);
  });

  it('grades nothing for a question the document no longer holds', () => {
    const out = gradeAttempt(ex, [{ questionId: 'gone', text: 'Et helt fornuftig svar.' }]);
    expect(out.answers[0]).toMatchObject({ question: null, result: null });
    // Plan 51 §6.5: no zeroes invented for an answer nothing could grade.
    expect(out.total).toBe(0);
    expect(out.score).toBe(100);
    expect(out.correct).toBe(false);
  });

  describe('requiresReview', () => {
    const passing = [
      { questionId: 'q1', text: 'Alle må ha lys foran og bak når det er mørkt.' },
      { questionId: 'q2', text: 'Kommunen vil ha færre ulykker om vinteren.' },
    ];
    const failing = [{ questionId: 'q1', text: 'Vet ikke helt hva jeg skal si.' }];

    it("'all' routes even a perfect attempt", () => {
      const all = document({ ...ex, settings: settings({ teacherReview: 'all' }) });
      expect(gradeAttempt(all, passing).requiresReview).toBe(true);
    });

    it("'flagged' routes only when something did not pass", () => {
      expect(gradeAttempt(ex, passing).requiresReview).toBe(false);
      expect(gradeAttempt(ex, failing).requiresReview).toBe(true);
    });

    it("'flagged' routes an answer nothing could grade", () => {
      expect(gradeAttempt(ex, [{ questionId: 'gone', text: 'Et svar.' }]).requiresReview).toBe(true);
    });

    it("'none' never routes", () => {
      const none = document({ ...ex, settings: settings({ teacherReview: 'none' }) });
      expect(gradeAttempt(none, failing).requiresReview).toBe(false);
    });
  });
});
