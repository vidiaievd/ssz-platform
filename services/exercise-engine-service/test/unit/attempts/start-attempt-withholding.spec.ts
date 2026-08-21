import { jest } from '@jest/globals';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

// `checkMode: PRACTICE` means "ship the answers so the client can check locally", and
// that is safe for eleven templates whose answers are a separate key. It is not safe
// for word_bank_gap_fill, whose content *is* the answer key, nor for error_correction,
// whose key is what the mistakes are derived from, nor for the translate pair, whose
// key is the exercise typed out.

const gapFillContent = {
  settings: {
    shuffle: true,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
  },
  sentences: [
    { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
    { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
  ],
  distractors: ['bestilt', 'regning'],
};

const gapFillAnswers = {
  feedback: { 's1#3': { fallback: 'Needs an infinitive.', why: 'Because.', pairs: {} } },
};

const errorCorrectionContent = {
  mode: 'sentences',
  items: [{ id: 'i1', wrong: 'I går jeg gikk på kino.' }],
};

const errorCorrectionAnswers = {
  items: {
    i1: { ref: 'I går gikk jeg på kino.', teacherNote: 'V2-regelen.' },
  },
};

const translateContent = {
  dir: 'to_target',
  langs: { explain: 'Russisk', target: 'Norsk' },
  format: 'set',
  items: [
    {
      id: 't1',
      dir: 'to_target',
      source: 'Я живу в Тромсё уже три года.',
      hint: 'Сколько времени — «i tre år».',
      gloss: [{ w: 'уже', t: 'allerede / nå' }],
    },
  ],
  check: { on: true, exactPass: true },
  flow: { selfCheck: 2 },
};

const translateAnswers = {
  items: {
    t1: {
      refs: ['Jeg har bodd i Tromsø i tre år nå.'],
      require: [{ text: 'har bodd', note: 'Презенс перфект.' }],
      explanation: 'Действие началось в прошлом и длится сейчас.',
      teacherNote: 'V2-regelen.',
    },
  },
};

const writingContent = {
  mode: 'letter',
  instruction: 'Skriv et sammenhengende brev.',
  prompt: 'Kommunen vil stenge svømmehallen.',
  letter: { register: 'formal', recipient: 'Tromsø kommune' },
  points: [{ id: 'p1', text: 'Presenter deg selv', required: true }],
  rubric: [{ id: 'c1', name: 'Oppgaveløsning', desc: '', weight: 2, metric: 'points' }],
  settings: { minWords: 120, maxWords: 200, passScore: 4, showRubric: 'afterGraded' },
};

const writingAnswers = {
  points: { p1: { keywords: ['jeg heter'] } },
  rubric: { c1: { levels: ['Nei', 'Litt', 'Nesten', 'Ja'] } },
  model: 'Hei, jeg heter Anna og skriver til dere fordi…',
};

function makeHandler(templateCode: string, content: unknown, expectedAnswers: unknown) {
  const attempts = {
    findInProgress: jest.fn(() => Promise.resolve(null)),
    findLatestReturned: jest.fn(() => Promise.resolve(null)),
    save: jest.fn(),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(
        Result.ok({
          exercise: {
            templateCode,
            targetLanguage: 'no',
            difficultyLevel: 'B1',
            content,
            expectedAnswers,
            answerCheckSettings: null,
          },
          template: { answerSchema: {}, defaultCheckSettings: {} },
        }),
      ),
    ),
    getPracticedAtoms: jest.fn(() => Promise.resolve(Result.ok([]))),
    // Not under test here — resolved to a miss so the review-context snapshot
    // (plan 44 §44.4) stays a no-op and this file can focus on withholding.
    getExercisePlacement: jest.fn(() =>
      Promise.resolve(Result.fail({ statusCode: 404, message: 'Not placed' })),
    ),
  };
  const organizationClient = {
    getMemberRole: jest.fn(),
    resolveStudentGroup: jest.fn(),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new StartAttemptHandler(
    attempts as any,
    contentClient as any,
    new ReviewContextResolver(contentClient as any, organizationClient as any),
    publisher as any,
  );
}

const practice = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');

describe('StartAttemptHandler — what leaves with the attempt', () => {
  it('ships no answers for a gap-fill, even in PRACTICE mode', async () => {
    const handler = makeHandler('word_bank_gap_fill', gapFillContent, gapFillAnswers);
    const result = await handler.execute(practice);

    expect(result.value.expectedAnswers).toBeNull();
    const shipped = JSON.stringify(result.value.exerciseContent);
    expect(shipped).not.toContain('Needs an infinitive');
  });

  it('ships the sentences with the gapped words cut out', async () => {
    const handler = makeHandler('word_bank_gap_fill', gapFillContent, gapFillAnswers);
    const result = await handler.execute(practice);

    const { sentences } = result.value.exerciseContent as { sentences: unknown };
    const rendered = JSON.stringify(sentences);
    expect(rendered).not.toContain('bestille');
    expect(rendered).not.toContain('regningen');
    // The rest of the sentence survives, comma and all.
    expect(rendered).toContain('takk?');
  });

  it('still offers the bank, which is what makes it answerable', async () => {
    const handler = makeHandler('word_bank_gap_fill', gapFillContent, gapFillAnswers);
    const result = await handler.execute(practice);

    const { bank } = result.value.exerciseContent as { bank: string[] };
    expect([...bank].sort()).toEqual(['bestille', 'bestilt', 'regning', 'regningen']);
  });

  it('ships no answer key for error correction, and no derived mistakes either', async () => {
    const handler = makeHandler('error_correction', errorCorrectionContent, errorCorrectionAnswers);
    const result = await handler.execute(practice);

    expect(result.value.expectedAnswers).toBeNull();
    const shipped = JSON.stringify(result.value.exerciseContent);
    expect(shipped).toContain('I går jeg gikk på kino.');
    expect(shipped).not.toContain('I går gikk jeg på kino.');
    expect(shipped).not.toContain('V2-regelen');
  });

  it('ships how many mistakes there are, which is what makes it answerable', async () => {
    const handler = makeHandler('error_correction', errorCorrectionContent, errorCorrectionAnswers);
    const result = await handler.execute(practice);

    const projected = result.value.exerciseContent as {
      totalErrors: number;
      items: Array<{ errorCount: number; words: string[] }>;
    };
    expect(projected.totalErrors).toBe(1);
    expect(projected.items[0].errorCount).toBe(1);
    // Tokenised on the server, so an edit indexes the same word on both sides.
    expect(projected.items[0].words).toEqual(['I', 'går', 'jeg', 'gikk', 'på', 'kino.']);
  });

  it('ships no accepted translations, no guards and no explanations', async () => {
    const handler = makeHandler('translate_to_target', translateContent, translateAnswers);
    const result = await handler.execute(practice);

    expect(result.value.expectedAnswers).toBeNull();
    const shipped = JSON.stringify(result.value.exerciseContent);
    // The sentence, its hint and its glosses are the task and travel with it.
    expect(shipped).toContain('Я живу в Тромсё уже три года.');
    expect(shipped).toContain('уже');
    // Everything the answer is made of stays on the server. A guard hands over the
    // words of the key just as plainly as the key does.
    expect(shipped).not.toContain('Jeg har bodd');
    expect(shipped).not.toContain('har bodd');
    expect(shipped).not.toContain('Презенс перфект');
    expect(shipped).not.toContain('V2-regelen');
  });

  it('ships what the runner needs to render: direction, languages and flow', async () => {
    const handler = makeHandler('translate_to_target', translateContent, translateAnswers);
    const result = await handler.execute(practice);

    const projected = result.value.exerciseContent as {
      dir: string;
      items: Array<{ id: string; dir: string; sourceLang: string; answerLang: string }>;
      flow: { selfCheck: number };
      exactPasses: boolean;
    };
    expect(projected.dir).toBe('to_target');
    expect(projected.items[0]).toMatchObject({
      id: 't1',
      dir: 'to_target',
      sourceLang: 'Russisk',
      answerLang: 'Norsk',
    });
    expect(projected.flow.selfCheck).toBe(2);
    // The runner says under the submit button whether a hit closes the exercise, and
    // must not have to infer it from settings it cannot see.
    expect(projected.exactPasses).toBe(true);
  });

  it('ships a writing task with no model answer, no keywords and no descriptors', async () => {
    const handler = makeHandler('writing_task', writingContent, writingAnswers);
    const result = await handler.execute(practice);

    const shipped = JSON.stringify(result.value.exerciseContent);
    expect(shipped).toContain('Presenter deg selv');
    expect(shipped).not.toContain('jeg heter');
    expect(shipped).not.toContain('Hei, jeg heter Anna');
    expect(shipped).not.toContain('Nesten');
    expect(result.value.expectedAnswers).toBeNull();
  });

  it('ships the descriptors when the author shows the rubric while writing', async () => {
    // The one case the projection needs the answer column for — plan 50 §5.
    const handler = makeHandler(
      'writing_task',
      { ...writingContent, settings: { ...writingContent.settings, showRubric: 'always' } },
      writingAnswers,
    );

    const result = await handler.execute(practice);

    const projected = result.value.exerciseContent as {
      rubric?: Array<{ id: string; levels: string[] }>;
    };
    expect(projected.rubric?.[0]?.levels).toEqual(['Nei', 'Litt', 'Nesten', 'Ja']);
    // Still not the example answer: that waits for the grade whatever the rubric does.
    expect(JSON.stringify(projected)).not.toContain('Hei, jeg heter Anna');
  });

  it('does not re-project a writing task content-service already projected', async () => {
    // `graded` mode: the key never left content-service, so the document arriving here
    // is already the student's view. A second pass would have no answer column to read
    // the descriptors from and would quietly drop them.
    const alreadyProjected = {
      ...writingContent,
      settings: { ...writingContent.settings, showRubric: 'always' },
      rubric: [{ id: 'c1', name: 'Oppgaveløsning', desc: '', weight: 2, levels: ['Nei', 'Litt', 'Nesten', 'Ja'] }],
      points: [{ id: 'p1', text: 'Presenter deg selv', required: true }],
    };
    const handler = makeHandler('writing_task', alreadyProjected, null);

    const result = await handler.execute(practice);

    expect(result.value.exerciseContent).toEqual(alreadyProjected);
    expect(result.value.expectedAnswers).toBeNull();
  });

  it('leaves the other templates exactly as they were', async () => {
    const content = { text_with_blanks: 'Jeg ___1___ norsk' };
    const answers = { blanks: [{ blank_id: 1, accepted_answers: ['snakker'] }] };
    const handler = makeHandler('fill_in_blank', content, answers);

    const result = await handler.execute(practice);
    expect(result.value.exerciseContent).toEqual(content);
    expect(result.value.expectedAnswers).toEqual(answers);
  });
});
