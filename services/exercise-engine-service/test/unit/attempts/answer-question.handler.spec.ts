import { jest } from '@jest/globals';
import { AnswerQuestionHandler } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.handler.js';
import { AnswerQuestionCommand } from '../../../src/modules/attempts/application/commands/answer-question/answer-question.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

// A two-question comprehension set, plus one question whose key was never finished — the
// runner never offers it, and neither does this.
const content = {
  title: 'Leseforståelse — sykkelregler',
  instruction: 'Svar med egne ord.',
  questions: [
    {
      id: 'q1',
      kind: 'reading',
      passage: 'Fra 1. januar må alle som sykler i mørket ha lys foran og bak.',
      prompt: 'Hva er nytt fra 1. januar?',
    },
    { id: 'q2', kind: 'opinion', passage: '', prompt: 'Ville du syklet om vinteren?' },
    { id: 'q3', kind: 'opinion', passage: '', prompt: 'Hva mener du om bot?' },
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
};

const expectedAnswers = {
  questions: {
    q1: {
      elements: [
        // The labels deliberately share no wording with the anchors: a label that
        // quoted its own phrase would make the leak test below unable to tell them apart.
        { id: 'e1', label: 'Kravet om lys', anchors: ['lys foran', 'foran og bak'], required: true },
        { id: 'e2', label: 'Når regelen gjelder', anchors: ['i mørket', 'når det er mørkt'], required: true },
      ],
      model: 'Alle syklister må ha lys foran og bak når det er mørkt.',
      why: 'Regelen står i første setning.',
    },
    q2: {
      elements: [{ id: 'e3', label: 'Gir en begrunnelse', anchors: ['fordi', 'siden'], required: true }],
      model: 'Nei, fordi veiene er glatte om vinteren.',
      why: 'Et meningsspørsmål teller når svaret begrunnes.',
    },
    // q3's elements were never written, so it can never be passed.
    q3: { elements: [], model: '', why: '' },
  },
};

function makeAttempt(overrides: Record<string, unknown> = {}) {
  const answers: Array<{ questionId: string; text: string; verdict: string }> = [];
  return {
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'short_answer',
    targetLanguage: 'no',
    get answeredQuestions() {
      return [...answers];
    },
    answerQuestion: jest.fn((props: { questionId: string; text: string; verdict: string }) => {
      if (answers.some((a) => a.questionId === props.questionId)) {
        return Result.fail({ message: `Question ${props.questionId} has already been answered` });
      }
      answers.push(props);
      return Result.ok();
    }),
    ...overrides,
  };
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

const command = (questionId = 'q1', text = 'Alle må ha lys foran og bak når det er mørkt.') =>
  new AnswerQuestionCommand('att-1', 'user-1', questionId, text);

describe('AnswerQuestionHandler', () => {
  it('grades the answer and reports what it covered', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(result.value.result).toMatchObject({
      questionId: 'q1',
      verdict: 'pass',
      covered: 2,
      total: 2,
      tooShort: false,
      why: 'Regelen står i første setning.',
    });
  });

  it('never sends back the phrases it matched against', async () => {
    // The anchors are the answer written in the words the student was asked to find.
    // The labels travel, the phrases do not.
    //
    // `showModel: 'never'` so the assertion can search the whole payload: the author's
    // model answer legitimately contains the anchors — that is what makes it a model
    // answer — and it ships under the other two policies.
    const { handler } = makeHandler(makeAttempt(), {
      content: { ...content, settings: { ...content.settings, showModel: 'never' } },
      expectedAnswers,
    });
    const result = await handler.execute(
      command('q1', 'Man må ha lys foran når det er mørkt, sier kommunen.'),
    );

    const wire = JSON.stringify(result.value);
    expect(wire).not.toContain('foran og bak');
    expect(wire).not.toContain('i mørket');
    expect(result.value.result.hits).toEqual([
      { id: 'e1', label: 'Kravet om lys', required: true, hit: true },
      { id: 'e2', label: 'Når regelen gjelder', required: true, hit: true },
    ]);
  });

  it('writes the answer down and counts the progress through the set', async () => {
    const attempt = makeAttempt();
    const { handler, attempts } = makeHandler(attempt);

    const first = await handler.execute(command());
    expect(first.value.answered).toBe(1);
    // q3 has no usable key, so it is not part of the set the student walks through.
    expect(first.value.total).toBe(2);
    expect(attempt.answerQuestion).toHaveBeenCalledWith({
      questionId: 'q1',
      text: 'Alle må ha lys foran og bak når det er mørkt.',
      verdict: 'pass',
    });
    expect(attempts.save).toHaveBeenCalled();
  });

  it('refuses a second answer to the same question', async () => {
    // IMPLEMENTATION.md states this as a rule about the model, not the UI: the queue
    // assumes one answer per student per question, and a hidden button is one replayed
    // request away from two.
    const { handler } = makeHandler(makeAttempt());
    await handler.execute(command());
    const again = await handler.execute(command('q1', 'Et helt annet svar denne gangen.'));

    expect(again.isFail).toBe(true);
  });

  it('refuses an empty answer before anything is written down', async () => {
    const attempt = makeAttempt();
    const { handler, contentClient } = makeHandler(attempt);
    const result = await handler.execute(command('q1', '   '));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'EMPTY_ANSWER' });
    // A client bug costs neither a round-trip for the key nor a question the student
    // can never revisit.
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
    expect(attempt.answerQuestion).not.toHaveBeenCalled();
  });

  it('refuses a question the set does not have', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(command('gone', 'Et svar.'));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'QUESTION_NOT_FOUND' });
  });

  it('refuses a question whose key was never finished', async () => {
    // Answering it would record a fail against a question nobody could have passed.
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(command('q3', 'Jeg synes boten er for høy.'));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'QUESTION_NOT_FOUND' });
  });

  it('refuses an attempt that is not this student’s', async () => {
    const { handler } = makeHandler(makeAttempt({ userId: 'someone-else' }));
    expect((await handler.execute(command())).error).toEqual({ code: 'FORBIDDEN' });
  });

  it('refuses a template that is not answered a question at a time', async () => {
    const { handler } = makeHandler(makeAttempt({ templateCode: 'writing_task' }));
    expect((await handler.execute(command())).error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  it('refuses a document of the old form — it is answered by submitting', async () => {
    // Plan 51 §8 Q1: one question, no ids to hand in against.
    const { handler } = makeHandler(makeAttempt(), {
      content: { question: 'Hvorfor trenger de egenkapital?', context: 'Tekst 3A.' },
      expectedAnswers: { accepted_answers: ['De må ha egenkapital for å få lån.'] },
    });

    expect((await handler.execute(command())).error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  describe('the model answer', () => {
    const withShowModel = (showModel: string) => ({
      content: { ...content, settings: { ...content.settings, showModel } },
      expectedAnswers,
    });

    it("comes back with the verdict under 'onClose'", async () => {
      const { handler } = makeHandler(makeAttempt(), withShowModel('onClose'));
      const result = await handler.execute(command());
      expect(result.value.result.model).toBe(
        'Alle syklister må ha lys foran og bak når det er mørkt.',
      );
    });

    it("is absent from the payload entirely under 'never'", async () => {
      const { handler } = makeHandler(makeAttempt(), withShowModel('never'));
      const result = await handler.execute(command());
      expect(result.value.result.model).toBeUndefined();
      expect(JSON.stringify(result.value)).not.toContain('Alle syklister');
    });
  });

  describe('the routing line', () => {
    const withReview = (teacherReview: string) => ({
      content: { ...content, settings: { ...content.settings, teacherReview } },
      expectedAnswers,
    });

    it("routes a passing answer under 'all'", async () => {
      const { handler } = makeHandler(makeAttempt(), withReview('all'));
      expect((await handler.execute(command())).value.routedForReview).toBe(true);
    });

    it("leaves a passing answer alone under 'flagged'", async () => {
      const { handler } = makeHandler(makeAttempt(), withReview('flagged'));
      expect((await handler.execute(command())).value.routedForReview).toBe(false);
    });

    it("routes an unclear answer under 'flagged'", async () => {
      const { handler } = makeHandler(makeAttempt(), withReview('flagged'));
      const result = await handler.execute(command('q1', 'Alle må ha lys foran og bak.'));
      expect(result.value.result.verdict).toBe('partial');
      expect(result.value.routedForReview).toBe(true);
    });

    it("routes nothing under 'none'", async () => {
      const { handler } = makeHandler(makeAttempt(), withReview('none'));
      const result = await handler.execute(command('q1', 'Jeg vet ikke hva teksten sier.'));
      expect(result.value.result.verdict).toBe('fail');
      expect(result.value.routedForReview).toBe(false);
    });
  });
});
