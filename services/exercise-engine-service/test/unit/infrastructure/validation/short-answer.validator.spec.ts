import { ShortAnswerValidator } from '../../../../src/infrastructure/validation/validators/short-answer.validator.js';

const validator = new ShortAnswerValidator();

const run = (
  text: string,
  expected: { reference_answer: string; accepted_answers?: string[] },
  checkSettings: Record<string, unknown> = { case_sensitive: false, trim_whitespace: true },
) =>
  validator.validate({
    submittedAnswer: { text },
    expectedAnswers: expected,
    checkSettings,
    targetLanguage: 'no',
  });

/** The seeded indirect-speech task from Norsk B1, leksjon 1. */
const indirectSpeech = {
  reference_answer: 'Bartek sa at han skulle begynne 1. april.',
  accepted_answers: ['bartek sa at han skulle begynne 1. april', 'at han skulle begynne 1. april'],
};

describe('ShortAnswerValidator — the old single-question form', () => {
  // Plan 51 §8 Q1: 144 seeded exercises are still written this way, and the rewrite must
  // leave every one of them grading exactly as before. None of these calls passes a
  // `content`, which is the dispatch working: no `questions` field, no new grader.
  it('auto-grades correct when text matches an accepted answer', () => {
    const result = run('på radio', { reference_answer: 'Hun hørte det på radio.', accepted_answers: ['på radio'] });
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('is case-insensitive and trims by default', () => {
    const result = run('  På Radio  ', { reference_answer: 'x', accepted_answers: ['på radio'] });
    expect(result.value.score).toBe(100);
  });

  it('routes to review when the answer is nowhere near the key', () => {
    const result = run('noe helt annet enn dette', { reference_answer: 'x', accepted_answers: ['på radio'] });
    expect(result.value.correct).toBe(false);
    expect(result.value.score).toBe(0);
    expect(result.value.requiresReview).toBe(true);
  });

  it('accepts the reference answer itself when no shortcuts are authored', () => {
    const result = run('Hun hørte det på radio.', { reference_answer: 'Hun hørte det på radio.' });
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('does not auto-grade an empty submission even if an accepted answer is empty-ish', () => {
    const result = run('   ', { reference_answer: 'x', accepted_answers: [''] });
    expect(result.value.requiresReview).toBe(true);
  });

  it('marks a case-only difference wrong — not for review — when case_sensitive is on', () => {
    const result = run('På Radio', { reference_answer: 'x', accepted_answers: ['på radio'] }, { case_sensitive: true });
    expect(result.value.correct).toBe(false);
    expect(result.value.requiresReview).toBe(false);
    expect(result.value.details).toMatchObject({ reason: 'case_mismatch' });
  });

  it('scores a near miss itself instead of handing it to a teacher', () => {
    const result = run('han skulle begynte 1. april', indirectSpeech);
    expect(result.value.correct).toBe(false);
    expect(result.value.requiresReview).toBe(false);
    expect(result.value.details).toMatchObject({
      target: 'at han skulle begynne 1. april',
      distance: 2,
      counts: { form: 1, wrong: 0, extra: 0, missing: 1 },
    });
  });

  it('gives partial credit for the words a near miss did get right', () => {
    const result = run('at han skulle begynte 1. april', indirectSpeech);
    expect(result.value.score).toBeGreaterThan(0);
    expect(result.value.score).toBeLessThan(100);
  });

  it('still reviews a rewrite the author never listed', () => {
    const result = run('Bartek fortalte meg at han begynner i jobben til våren', indirectSpeech);
    expect(result.value.requiresReview).toBe(true);
  });
});


// ── The form of the design handoff ─────────────────────────────────────────────────
//
// A set of open questions whose key is semantic elements: each one thing the answer must
// say, carrying the phrasings a student might say it with.

const document = {
  content: {
    title: 'Leseforståelse — sykkelregler',
    instruction: 'Svar med egne ord.',
    questions: [
      {
        id: 'q1',
        kind: 'reading',
        passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
        prompt: 'Hva er nytt fra 1. januar?',
      },
      {
        id: 'q2',
        kind: 'opinion',
        passage: '',
        prompt: 'Ville du syklet om vinteren?',
      },
    ],
    settings: {
      passRule: 'all',
      passN: 2,
      typos: true,
      caseless: true,
      minWords: 3,
      showBreakdown: true,
      showModel: 'onClose',
      aiStage: false,
      aiGrammar: true,
      teacherReview: 'flagged',
      progress: true,
    },
  } as Record<string, unknown>,
  expectedAnswers: {
    questions: {
      q1: {
        elements: [
          { id: 'e1', label: 'Kravet om lys', anchors: ['lys foran', 'foran og bak'], required: true },
          { id: 'e2', label: 'Gjelder i mørket', anchors: ['i mørket', 'når det er mørkt'], required: true },
        ],
        model: 'Alle syklister må ha lys foran og bak når det er mørkt.',
        why: 'Regelen står i første setning.',
      },
      q2: {
        elements: [{ id: 'e3', label: 'Gir en begrunnelse', anchors: ['fordi', 'siden'], required: true }],
        model: 'Nei, fordi veiene er glatte om vinteren.',
        why: 'Et meningsspørsmål teller når svaret begrunnes.',
      },
    },
  } as Record<string, unknown>,
};

function gradeSet(
  answers: Array<{ questionId: string; text: string }>,
  settings: Record<string, unknown> = {},
) {
  const content = {
    ...document.content,
    settings: { ...(document.content['settings'] as Record<string, unknown>), ...settings },
  };
  return validator.validate({
    submittedAnswer: { answers },
    content,
    expectedAnswers: document.expectedAnswers,
    checkSettings: {},
    targetLanguage: 'no',
  });
}

type Details = {
  totalItems: number;
  routedItems: number;
  passedItems: number;
  coveredElements: number;
  totalElements: number;
  items: Array<{
    itemId: string;
    prompt: string | null;
    submitted: string;
    verdict: string | null;
    covered: number;
    total: number;
    tooShort: boolean;
    routing: string;
    model: string | null;
    elements: Array<{ id: string; label: string; hit: boolean; anchor: string | null }>;
  }>;
};

describe('ShortAnswerValidator — the form of the design handoff', () => {
  it('closes a set every question passed, without a teacher', () => {
    const result = gradeSet([
      { questionId: 'q1', text: 'Alle må ha lys foran og bak når det er mørkt.' },
      { questionId: 'q2', text: 'Nei, fordi det er glatt om vinteren.' },
    ]);

    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('scores over elements rather than over questions', () => {
    // One of q1's two elements and q2's only one: 2 of 3, not "one and a half questions".
    const result = gradeSet([
      { questionId: 'q1', text: 'Alle må ha lys foran og bak.' },
      { questionId: 'q2', text: 'Nei, fordi det er glatt om vinteren.' },
    ]);

    const details = result.value.details as Details;
    expect(details.coveredElements).toBe(2);
    expect(details.totalElements).toBe(3);
    expect(details.items[0]!.verdict).toBe('partial');
  });

  it('carries no score once it routes — the teacher\'s mark is the score', () => {
    const result = gradeSet([{ questionId: 'q1', text: 'Jeg vet ikke hva teksten sier.' }]);

    expect(result.value.requiresReview).toBe(true);
    expect(result.value.score).toBe(0);
    expect(result.value.correct).toBe(false);
  });

  it('gives the queue the phrase that matched, and the one that did not', () => {
    // The reason a row here beats a wall of prose: on a `partial` the fix is usually the
    // key rather than the mark, and only the matched phrase shows that.
    const details = gradeSet([
      { questionId: 'q1', text: 'Man må ha lys foran når det er mørkt.' },
    ]).value.details as Details;

    expect(details.items[0]!.elements).toEqual([
      { id: 'e1', label: 'Kravet om lys', required: true, hit: true, anchor: 'lys foran' },
      { id: 'e2', label: 'Gjelder i mørket', required: true, hit: true, anchor: 'når det er mørkt' },
    ]);
    expect(details.items[0]!.prompt).toBe('Hva er nytt fra 1. januar?');
    expect(details.items[0]!.model).toBe('Alle syklister må ha lys foran og bak når det er mørkt.');
  });

  it('flags an answer as too short without failing it outright', () => {
    const details = gradeSet([{ questionId: 'q2', text: 'Nei, fordi.' }]).value.details as Details;

    expect(details.items[0]!.tooShort).toBe(true);
    expect(details.items[0]!.verdict).toBe('partial');
  });

  describe('routing', () => {
    const passing = [
      { questionId: 'q1', text: 'Alle må ha lys foran og bak når det er mørkt.' },
      { questionId: 'q2', text: 'Nei, fordi det er glatt om vinteren.' },
    ];

    it("sends everything to a teacher under 'all'", () => {
      const result = gradeSet(passing, { teacherReview: 'all' });
      expect(result.value.requiresReview).toBe(true);
      expect((result.value.details as Details).routedItems).toBe(2);
    });

    it("counts nothing as machine-closed under 'all', however well it was answered", () => {
      // `passedItems` is what the attempt stores as `autoPassedItems`, which is what the
      // queue offers a batch approval on. Two flawless answers that both go to a person
      // are not a submission the machine closed, and a hint saying otherwise offers a
      // batch that `isMachineClean` then refuses.
      const details = gradeSet(passing, { teacherReview: 'all' }).value.details as Details;

      expect(details.passedItems).toBe(0);
      expect(details.items.every((item) => item.routing === 'teacher')).toBe(true);
      expect(details.items.every((item) => item.verdict === 'pass')).toBe(true);
    });

    it("sends only the unclear ones under 'flagged'", () => {
      const result = gradeSet(
        [passing[0]!, { questionId: 'q2', text: 'Nei. Kanskje. Vet ikke helt.' }],
        { teacherReview: 'flagged' },
      );
      expect(result.value.requiresReview).toBe(true);
      const details = result.value.details as Details;
      expect(details.routedItems).toBe(1);
      expect(details.items[0]!.routing).toBe('pass');
      expect(details.items[1]!.routing).toBe('teacher');
    });

    /**
     * The batch button's premise, checked against this template rather than assumed.
     *
     * `isMachineClean` sweeps a submission through only when every item was closed by the
     * check — which for `short_answer` can never be true of anything that reached the
     * queue at all. Under `'flagged'` an attempt is only routed because at least one
     * question was unclear; under `'all'` every question is a person's by definition; and
     * under `'none'` nothing is routed. So the batch never applies here, and it is the
     * routing rather than a template check that says so.
     */
    it('never leaves a routed submission with nothing for a person to read', () => {
      const cases = [
        gradeSet(passing, { teacherReview: 'all' }),
        gradeSet([passing[0]!, { questionId: 'q2', text: 'Nei. Kanskje. Vet ikke helt.' }], {
          teacherReview: 'flagged',
        }),
        gradeSet([{ questionId: 'q1', text: 'Vet ikke.' }], { teacherReview: 'none' }),
      ];

      for (const result of cases) {
        const details = result.value.details as Details;
        const machineClean =
          details.items.length > 0 && details.items.every((item) => item.routing === 'pass');

        expect(result.value.requiresReview && machineClean).toBe(false);
      }
    });

    it("sends nothing under 'none', even a failed answer", () => {
      const result = gradeSet([{ questionId: 'q1', text: 'Vet ikke.' }], {
        teacherReview: 'none',
      });
      expect(result.value.requiresReview).toBe(false);
      expect((result.value.details as Details).routedItems).toBe(0);
    });
  });

  it('reports an answer to a question the author has since deleted, and routes it', () => {
    // A row missing from the queue is an answer nobody reads. Nothing can be said about
    // the verdict, so nothing is said — no invented zeroes.
    const details = gradeSet([{ questionId: 'gone', text: 'Et helt fornuftig svar.' }]).value
      .details as Details;

    expect(details.items[0]).toMatchObject({
      itemId: 'gone',
      prompt: null,
      verdict: null,
      covered: 0,
      total: 0,
      routing: 'teacher',
    });
  });

  it('refuses a submission that is not a list of answers', () => {
    const result = validator.validate({
      submittedAnswer: { text: 'Alle må ha lys foran og bak.' },
      content: document.content,
      expectedAnswers: document.expectedAnswers,
      checkSettings: {},
      targetLanguage: 'no',
    });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('refuses an exercise with no questions', () => {
    const result = validator.validate({
      submittedAnswer: { answers: [{ questionId: 'q1', text: 'noe' }] },
      content: { questions: [] },
      expectedAnswers: {},
      checkSettings: {},
      targetLanguage: 'no',
    });

    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });

  it('never lets the anchors out of the details it did not mean to', () => {
    // The submit handler is what keeps these from the learner; this only asserts that the
    // teacher's row is the only place they appear.
    const details = gradeSet([
      { questionId: 'q1', text: 'Alle må ha lys foran og bak når det er mørkt.' },
    ]).value.details as Details;

    expect(JSON.stringify(details.items[0]!.elements)).toContain('lys foran');
    expect(details.items[0]!.elements.every((e) => 'anchor' in e)).toBe(true);
  });
});
