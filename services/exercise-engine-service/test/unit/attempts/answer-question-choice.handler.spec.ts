import { jest } from '@jest/globals';
import { AnswerQuestionHandler } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.handler.js';
import { AnswerQuestionCommand } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../../src/shared/kernel/result.js';
import type { AnswerVerdict } from '@ssz/shared-kernel/multiple-choice';

// The half of `answer-question` that judges a pick. Everything asserted here is about
// dosing: the key must not travel while a try remains, the 50/50 must leave something to
// choose between, and which try a question was taken on has to be the server's fact.

const content = {
  title: 'Indirekte tale',
  instruction: 'Velg riktig form.',
  questions: [
    {
      id: 'q1',
      kind: 'grammar',
      context: '',
      stem: 'Han sa at han ___ sliten.',
      options: [
        { id: 'o1', text: 'var', fixed: false },
        { id: 'o2', text: 'er', fixed: false },
        { id: 'o3', text: 'har vært', fixed: false },
        { id: 'o4', text: 'skal være', fixed: false },
      ],
    },
    {
      id: 'q2',
      kind: 'grammar',
      context: '',
      stem: 'Hun spurte om jeg ___ med.',
      options: [
        { id: 'p1', text: 'ville bli', fixed: false },
        { id: 'p2', text: 'vil bli', fixed: false },
      ],
    },
    // Never finished: no key was ever marked, so the runner does not offer it.
    { id: 'q3', kind: 'grammar', context: '', stem: 'Ufullført.', options: [] },
  ],
  settings: {
    letters: true,
    layout: 'list',
    shuffle: true,
    shuffleQuestions: false,
    instant: false,
    retry: 'one',
    eliminate: true,
    showWhyWrong: true,
    explainOnCorrect: true,
    progress: true,
  },
};

const expectedAnswers = {
  questions: {
    q1: {
      correctOptionId: 'o1',
      why: 'Etter «sa at» flyttes presens til preteritum.',
      options: {
        o2: 'Presens holder seg ikke etter et preteritum.',
        o3: 'Perfektum uttrykker noe annet enn samtidighet.',
      },
    },
    q2: { correctOptionId: 'p1', why: 'Samme regel etter «spurte om».', options: {} },
    // q3's key was never marked, so it can never be answered.
    q3: { correctOptionId: '', why: '', options: {} },
  },
};

function makeAttempt(settings: Record<string, unknown> = {}) {
  return Attempt.reconstitute({
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'multiple_choice',
    targetLanguage: 'nb',
    difficultyLevel: 'B1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'IN_PROGRESS',
    score: null,
    passed: null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: null,
    containerId: null,
    groupId: null,
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    draftAnswer: null,
    draftSavedAt: null,
    answeredQuestions: null,
    checkedRows: null,
    pickedOptions: null,
    rubricMarks: null,
    rubricSnapshot: null,
    ...settings,
  });
}

function makeHandler(attempt: unknown, document: unknown = { content, expectedAnswers }) {
  const attempts = { findById: jest.fn(() => Promise.resolve(attempt)), save: jest.fn() };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok({ exercise: document }))),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = new AnswerQuestionHandler(attempts as any, contentClient as any);
  return { handler, attempts, contentClient };
}

const pick = (questionId: string, optionId: string | null, reveal = false) =>
  new AnswerQuestionCommand('att-1', 'user-1', questionId, {
    kind: 'option',
    optionId,
    reveal,
  });

/** The settings of the document, with the named overrides. */
const withSettings = (overrides: Record<string, unknown>) => ({
  content: { ...content, settings: { ...content.settings, ...overrides } },
  expectedAnswers,
});

describe('AnswerQuestionHandler — multiple_choice', () => {
  it('reports a hit and hands over the key and the rule, because the question is closed', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(pick('q1', 'o1'));
    const verdict = result.value.result as AnswerVerdict;

    expect(verdict.correct).toBe(true);
    expect(verdict.attempt).toBe(1);
    expect(verdict.closed).toBe(true);
    expect(verdict.keyOptionId).toBe('o1');
    expect(verdict.why).toBe('Etter «sa at» flyttes presens til preteritum.');
    expect(result.value.templateCode).toBe('multiple_choice');
  });

  it('withholds the key while a try remains, and sends the rebuttal instead', async () => {
    // The rule this whole path exists for (plan 53 §6.1, IMPLEMENTATION.md "Grading
    // payload"): a key handed over on a wrong pick makes the retry and the 50/50 theatre.
    const { handler } = makeHandler(makeAttempt());
    const verdict = (await handler.execute(pick('q1', 'o2'))).value.result as AnswerVerdict;

    expect(verdict.correct).toBe(false);
    expect(verdict.closed).toBe(false);
    expect(verdict.attemptsLeft).toBe(1);
    expect(verdict.keyOptionId).toBeUndefined();
    expect(verdict.why).toBeUndefined();
    expect(verdict.optionWhy).toBe('Presens holder seg ikke etter et preteritum.');
    expect(JSON.stringify(verdict)).not.toContain('sa at');
  });

  it('leaves the key and exactly one distractor standing after the 50/50', async () => {
    const attempt = makeAttempt();
    const { handler } = makeHandler(attempt);
    const verdict = (await handler.execute(pick('q1', 'o2'))).value.result as AnswerVerdict;

    const survivors = ['o1', 'o2', 'o3', 'o4'].filter(
      (id) => !(verdict.eliminated ?? []).includes(id),
    );
    expect(survivors).toContain('o1');
    expect(survivors).toHaveLength(2);
    // And the dimmed set is written down, so a second 50/50 narrows what is left rather
    // than dealing again.
    expect(attempt.pickedOptions[0]?.eliminated).toEqual(verdict.eliminated);
  });

  it('does not fire the 50/50 when it would leave the key alone on screen', async () => {
    // q2 has two options. Dimming the wrong one hands over the answer under the name of
    // a hint — the rule «the key and one distractor always survive» read the other way.
    const { handler } = makeHandler(makeAttempt());
    const verdict = (await handler.execute(pick('q2', 'p2'))).value.result as AnswerVerdict;

    expect(verdict.eliminated ?? []).toEqual([]);
  });

  it('closes the question when the budget runs out, and only then shows the key', async () => {
    const attempt = makeAttempt();
    const { handler } = makeHandler(attempt);

    const first = (await handler.execute(pick('q1', 'o2'))).value.result as AnswerVerdict;
    expect(first.keyOptionId).toBeUndefined();

    const second = (await handler.execute(pick('q1', 'o3'))).value.result as AnswerVerdict;
    expect(second.attempt).toBe(2);
    expect(second.attemptsLeft).toBe(0);
    expect(second.closed).toBe(true);
    expect(second.keyOptionId).toBe('o1');
    expect(attempt.pickedOptions[0]?.picks).toEqual(['o2', 'o3']);
  });

  it('closes the question on the first wrong pick under retry: none', async () => {
    const { handler } = makeHandler(makeAttempt(), withSettings({ retry: 'none' }));
    const verdict = (await handler.execute(pick('q1', 'o2'))).value.result as AnswerVerdict;

    expect(verdict.closed).toBe(true);
    expect(verdict.attemptsLeft).toBe(0);
    expect(verdict.keyOptionId).toBe('o1');
  });

  it('refuses a pick at a question that is already closed', async () => {
    const attempt = makeAttempt();
    const { handler, contentClient } = makeHandler(attempt);
    await handler.execute(pick('q1', 'o1'));

    const again = await handler.execute(pick('q1', 'o2'));

    expect(again.isFail).toBe(true);
    expect(again.error).toEqual({ code: 'QUESTION_CLOSED' });
    // And it costs no round-trip: a replayed request must never reach the judge, because
    // the key rides on the verdict.
    expect(contentClient.getExerciseForAttempt).toHaveBeenCalledTimes(1);
  });

  it('shows the answer on «Vis svaret» without spending a try', async () => {
    const attempt = makeAttempt();
    const { handler } = makeHandler(attempt);
    await handler.execute(pick('q1', 'o2'));

    const revealed = (await handler.execute(pick('q1', null, true))).value
      .result as AnswerVerdict;

    expect(revealed.closed).toBe(true);
    expect(revealed.correct).toBe(false);
    expect(revealed.keyOptionId).toBe('o1');
    expect(revealed.why).toBe('Etter «sa at» flyttes presens til preteritum.');
    // One pick was made, not two: the counter stands still while the answer is shown.
    expect(attempt.pickedOptions[0]?.picks).toEqual(['o2']);
    expect(attempt.pickedOptions[0]?.revealed).toBe(true);
  });

  it('counts progress by the questions that are finished, not the ones touched', async () => {
    const { handler } = makeHandler(makeAttempt());

    const wrong = await handler.execute(pick('q1', 'o2'));
    expect(wrong.value.answered).toBe(0);
    // q3 was never given a key, so it is not part of the set the student walks through.
    expect(wrong.value.total).toBe(2);

    const right = await handler.execute(pick('q1', 'o1'));
    expect(right.value.answered).toBe(1);
  });

  it('never routes to a teacher', async () => {
    // «The server counts» is not «a person marks» (plan 53 §3.10).
    const { handler } = makeHandler(makeAttempt());
    expect((await handler.execute(pick('q1', 'o1'))).value.routedForReview).toBe(false);
  });

  it('refuses a question the set has no key for', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(pick('q3', 'x1'));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'QUESTION_NOT_FOUND' });
  });

  it('refuses a pick with no option and no reveal, before the round-trip', async () => {
    const { handler, contentClient } = makeHandler(makeAttempt());
    const result = await handler.execute(pick('q1', null));

    expect(result.error).toEqual({ code: 'EMPTY_ANSWER' });
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
  });

  it('refuses a typed answer sent to a multiple-choice set', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(
      new AnswerQuestionCommand('att-1', 'user-1', 'q1', { kind: 'text', text: 'var' }),
    );

    expect(result.error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  it('refuses a document of the old form — it is answered by submitting', async () => {
    const { handler } = makeHandler(makeAttempt(), {
      content: {
        question: 'Han sa at han ___ sliten.',
        options: [
          { id: 'a', text: 'var' },
          { id: 'b', text: 'er' },
        ],
      },
      expectedAnswers: { correct_option_ids: ['a'] },
    });

    expect((await handler.execute(pick('q1', 'a'))).error).toEqual({
      code: 'UNSUPPORTED_TEMPLATE',
    });
  });

  it('dims the same distractor on a replayed 50/50', async () => {
    // Seeded by the attempt and the question: a reload that re-dealt would be a second
    // hint, and the order the server counts in would drift from the one on screen.
    const first = (await makeHandler(makeAttempt()).handler.execute(pick('q1', 'o2'))).value
      .result as AnswerVerdict;
    const second = (await makeHandler(makeAttempt()).handler.execute(pick('q1', 'o2'))).value
      .result as AnswerVerdict;

    expect(second.eliminated).toEqual(first.eliminated);
  });
});
