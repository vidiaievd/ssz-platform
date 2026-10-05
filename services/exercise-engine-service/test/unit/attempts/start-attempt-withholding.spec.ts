import { jest } from '@jest/globals';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { Result } from '../../../src/shared/kernel/result.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { attemptShuffle } from '../../../src/shared/application/services/multiple-choice-attempt.js';
import { toStudentProjection as mcToStudentProjection } from '@ssz/shared-kernel/multiple-choice';
import {
  shuffled as mcgShuffled,
  toStudentProjection as mcgToStudentProjection,
} from '@ssz/shared-kernel/multiple-choice-group';
import { seedFrom } from '../../../src/shared/application/services/multiple-choice-attempt.js';
import {
  shuffled as sbShuffled,
  toStudentProjection as sbToStudentProjection,
} from '@ssz/shared-kernel/sort-into-buckets';
import { toStudentProjection as htToStudentProjection } from '@ssz/shared-kernel/highlight-in-text';
import {
  emptyContent as dcEmptyContent,
  toContent as dcToContent,
  toExpectedAnswers as dcToExpectedAnswers,
  toStudentProjection as dcToStudentProjection,
} from '@ssz/shared-kernel/dictation';
import {
  sampleContent as itSampleContent,
  toContent as itToContent,
  toExpectedAnswers as itToExpectedAnswers,
  toStudentProjection as itToStudentProjection,
  updateInput as itUpdateInput,
  updateSettings as itUpdateSettings,
} from '@ssz/shared-kernel/inflection-table';
import type { InflectionTableContent } from '@ssz/shared-kernel/inflection-table';

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

/**
 * One definition per check mode, so a test can say what `PRACTICE` answers and what
 * `GRADED` answers separately — which is the whole subject of the `multiple_choice`
 * cases below. `null` stands for a fetch that fails.
 */
type DefinitionByMode = (
  mode: string,
) => { content: unknown; expectedAnswers: unknown } | null;

function makeHandler(templateCode: string, content: unknown, expectedAnswers: unknown) {
  return makeHandlerByMode(templateCode, () => ({ content, expectedAnswers })).handler;
}

/** The same handler, plus the modes it asked content-service for, in order. */
function makeHandlerByMode(templateCode: string, byMode: DefinitionByMode) {
  const modes: string[] = [];
  const attempts = {
    findInProgress: jest.fn(() => Promise.resolve(null)),
    findOpenBoard: jest.fn(() => Promise.resolve(null)),
    findLatestReturned: jest.fn(() => Promise.resolve(null)),
    save: jest.fn(),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn((_id: string, _language: string, mode: string) => {
      modes.push(mode);
      const definition = byMode(mode);
      if (definition === null) {
        return Promise.resolve(Result.fail({ statusCode: 503, message: 'Content is away' }));
      }
      return Promise.resolve(
        Result.ok({
          exercise: {
            templateCode,
            targetLanguage: 'no',
            difficultyLevel: 'B1',
            content: definition.content,
            expectedAnswers: definition.expectedAnswers,
            answerCheckSettings: null,
          },
          template: { answerSchema: {}, defaultCheckSettings: {} },
        }),
      );
    }),
    getPracticedAtoms: jest.fn(() => Promise.resolve(Result.ok([]))),
    // Not under test here — resolved to a miss so the review-context snapshot
    // (plan 44 §44.4) stays a no-op and this file can focus on withholding.
    getExercisePlacement: jest.fn(() =>
      Promise.resolve(Result.fail({ statusCode: 404, message: 'Not placed' })),
    ),
  };
  const organizationClient = {
    getMemberRole: jest.fn(),
    resolveLearnerReviewContext: jest.fn(() =>
      Promise.resolve(Result.ok({ schoolId: null, groupId: null, groupName: null })),
    ),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = new StartAttemptHandler(
    attempts as any,
    contentClient as any,
    new ReviewContextResolver(contentClient as any, organizationClient as any),
    publisher as any,
  );

  return { handler, modes, attempts };
}

const practice = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');
const graded = new StartAttemptCommand('user-1', 'ex-1', 'no', 'assignment-1', null, 'GRADED');

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

  describe('short_answer', () => {
    // The sharpest case here: the key is a set of anchor phrases, which is the answer
    // written in the words the student is being asked to find.
    const shortAnswerContent = {
      title: 'Leseforståelse',
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
          kind: 'listening',
          passage: 'God morgen, dette er nyhetene fra NRK.',
          prompt: 'Hvem snakker?',
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
    };

    const shortAnswerAnswers = {
      questions: {
        q1: {
          elements: [
            { id: 'e1', label: 'Kravet om lykt', anchors: ['lykt foran'], required: true },
          ],
          model: 'Alle syklister må ha lykt foran og bak i mørket.',
          why: 'Regelen står i første setning.',
        },
        q2: {
          elements: [{ id: 'e2', label: 'Kringkasteren', anchors: ['kanalen'], required: true }],
          model: 'Det er kanalen selv som sender.',
          why: 'Kanalen nevner seg selv.',
        },
      },
    };

    it('ships the questions and withholds the whole key', async () => {
      const handler = makeHandler('short_answer', shortAnswerContent, shortAnswerAnswers);
      const result = await handler.execute(practice);

      const projected = result.value.exerciseContent as {
        questions: Array<{ id: string; prompt: string; passage?: string }>;
      };
      expect(projected.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
      expect(projected.questions[0]?.prompt).toBe('Hva er nytt fra 1. januar?');

      const shipped = JSON.stringify(result.value.exerciseContent);
      expect(shipped).not.toContain('lykt foran');
      expect(shipped).not.toContain('Kravet om lykt');
      expect(shipped).not.toContain('Alle syklister');
      expect(shipped).not.toContain('Regelen står');
      expect(result.value.expectedAnswers).toBeNull();
    });

    it('withholds a listening transcript — it is the answer read aloud', async () => {
      const handler = makeHandler('short_answer', shortAnswerContent, shortAnswerAnswers);
      const result = await handler.execute(practice);

      const projected = result.value.exerciseContent as {
        questions: Array<{ passage?: string }>;
      };
      expect(projected.questions[0]?.passage).toBeDefined();
      expect(projected.questions[1]?.passage).toBeUndefined();
      expect(JSON.stringify(projected)).not.toContain('God morgen');
    });

    it('ships the model answer when the author shows it while writing', async () => {
      const handler = makeHandler(
        'short_answer',
        { ...shortAnswerContent, settings: { ...shortAnswerContent.settings, showModel: 'always' } },
        shortAnswerAnswers,
      );

      const result = await handler.execute(practice);

      const projected = result.value.exerciseContent as {
        questions: Array<{ model?: string }>;
      };
      expect(projected.questions[0]?.model).toBe('Alle syklister må ha lykt foran og bak i mørket.');
      // Still not the phrases: knowing the shape of a good answer is not knowing the key.
      expect(JSON.stringify(projected)).not.toContain('lykt foran og bak i mørket.«');
      expect(JSON.stringify(projected)).not.toContain('Kravet om lykt');
    });

    it('does not re-project a set content-service already projected', async () => {
      const alreadyProjected = {
        instruction: 'Svar med egne ord.',
        questions: [{ id: 'q1', kind: 'reading', prompt: 'Hva er nytt?', passage: 'Teksten.' }],
        settings: shortAnswerContent.settings,
      };
      const handler = makeHandler('short_answer', alreadyProjected, null);

      const result = await handler.execute(practice);
      expect(result.value.exerciseContent).toEqual(alreadyProjected);
      expect(result.value.expectedAnswers).toBeNull();
    });

    it('ships a document of the old form exactly as PRACTICE always has', async () => {
      // Plan 51 §8 Q1: 144 of these are live, and their key is what local checking uses.
      const old = { question: 'Hvorfor trenger de egenkapital?', context: 'Tekst 3A.' };
      const key = { accepted_answers: ['De må ha egenkapital for å få lån.'] };
      const handler = makeHandler('short_answer', old, key);

      const result = await handler.execute(practice);
      expect(result.value.exerciseContent).toEqual(old);
      expect(result.value.expectedAnswers).toEqual(key);
    });
  });

  describe('sentence_schema', () => {
    // The key is which field each piece belongs in — and `row.text`, the sentence in its
    // correct order, which the handoff's Security section omits and plan 52 §3.2 adds.
    const schemaContent = {
      title: 'Indirekte tale',
      instruction: 'Bygg om setningen og legg den i skjemaet.',
      presetId: 'blank',
      clauses: ['sub'],
      schema: {
        sub: [
          { id: 'f-sub', short: 'sub', label: 'Subjunksjon', hint: '', optional: false },
          { id: 'f-subj', short: 'n', label: 'Subjekt', hint: '', optional: false },
          { id: 'f-v', short: 'v', label: 'Verbal', hint: '', optional: false },
          { id: 'f-slutt', short: 'N', label: 'Sluttfelt', hint: '', optional: true },
        ],
      },
      rows: [
        {
          id: 'r1',
          clause: 'sub',
          source: '«Jeg kommer i morgen», sa han.',
          chunks: [
            { id: 'c1', text: 'at' },
            { id: 'c2', text: 'han' },
            { id: 'c3', text: 'kommer' },
            { id: 'c4', text: 'i morgen' },
          ],
          extras: [],
        },
      ],
      settings: {
        labels: true,
        hints: false,
        counts: false,
        prefill: 'none',
        markEmpty: false,
        perField: true,
        hintAfterMistake: true,
        shuffle: false,
        extras: true,
        order: 'strict',
      },
    };

    const schemaKey = {
      rows: {
        r1: {
          text: 'at han kommer i morgen',
          why: 'Subjunksjonen «at» innleder leddsetningen.',
          fields: { c1: 'f-sub', c2: 'f-subj', c3: 'f-v', c4: 'f-slutt' },
          alt: {},
          fb: { c1: 'Subjunksjonen står først.' },
        },
      },
    };

    it('ships the pieces and no placement, no rule, no note, no sentence', async () => {
      const handler = makeHandler('sentence_schema', schemaContent, schemaKey);
      const result = await handler.execute(practice);

      const projected = result.value.exerciseContent as {
        rows: Array<{ bank: Array<{ id: string; text: string }>; source: string }>;
      };
      expect(projected.rows[0]?.bank.map((i) => i.text)).toEqual([
        'at',
        'han',
        'kommer',
        'i morgen',
      ]);
      // The sentence to rewrite is the prompt and stays (§3.8); the target does not.
      expect(projected.rows[0]?.source).toBe('«Jeg kommer i morgen», sa han.');

      const wire = JSON.stringify(result.value);
      expect(wire).not.toContain('at han kommer i morgen');
      expect(wire).not.toContain('Subjunksjonen står først');
      expect(wire).not.toContain('"c1":"f-sub"');
      expect(result.value.expectedAnswers).toBeNull();
    });

    it('does not re-project a set content-service already projected', async () => {
      // `graded` mode: the key never left content-service. A second pass would read a
      // projection — whose rows carry a bank rather than chunks — as a set where nothing
      // is placed, and hand back an empty board.
      const alreadyProjected = {
        title: 'Indirekte tale',
        instruction: 'Bygg om setningen og legg den i skjemaet.',
        rows: [
          {
            id: 'r1',
            clause: 'sub',
            fields: schemaContent.schema.sub,
            bank: [{ id: 'c1', text: 'at' }],
            source: '«Jeg kommer i morgen», sa han.',
            counts: null,
            start: {},
          },
        ],
        settings: schemaContent.settings,
      };
      const handler = makeHandler('sentence_schema', alreadyProjected, null);

      const result = await handler.execute(practice);

      expect(result.value.exerciseContent).toEqual(alreadyProjected);
      expect(result.value.expectedAnswers).toBeNull();
    });

    it('hands on a document that is not a set, rather than blanking it', async () => {
      // Plan 52 §8 Q7: nothing is left on the old form. One that turns up anyway would
      // project to no `rows` at all, which reads as an exercise with nothing in it
      // rather than one that needs rewriting.
      const old = {
        sentence: 'I morgen skal jeg reise til Bergen.',
        source_sentence: 'Jeg skal reise til Bergen i morgen.',
        schema_type: 'main',
        fields: [{ id: 'forfelt', label: 'Forfelt' }],
        tokens: [{ id: 't1', text: 'I morgen' }],
      };
      const key = { placements: [{ field_id: 'forfelt', token_ids: ['t1'] }] };
      const handler = makeHandler('sentence_schema', old, key);

      const result = await handler.execute(practice);
      expect(result.value.exerciseContent).toEqual(old);
      expect(result.value.expectedAnswers).toEqual(key);
    });
  });

  describe('multiple_choice_group', () => {
    // Plan 54 §3.2 and §3.5. The inversion worth testing: nothing in this content column
    // is a secret — the column each statement belongs in, the author's line and the quote
    // are all in the key column — but the key column is what decides which statements the
    // student is *shown at all*. A projection built from the content alone would ship the
    // half-written rows too, and one built with the key missing ships nothing.
    const groupContent = {
      title: 'Tekst 1A',
      instruction: 'Er påstandene riktige eller gale?',
      source: {
        mode: 'inline',
        label: 'Bartek søker ny jobb',
        text: 'Bartek er snekker. Han søker en ny jobb i Bergen.',
      },
      columns: [
        { id: 'c1', label: 'Riktig', short: 'R' },
        { id: 'c2', label: 'Galt', short: 'G' },
      ],
      rows: [
        { id: 'r1', text: 'Bartek er snekker.' },
        { id: 'r2', text: 'Bartek søker jobb i Oslo.' },
        { id: 'r3', text: 'Bartek bor i Bergen.' },
      ],
      settings: {
        numbering: true,
        shuffleRows: true,
        layout: 'auto',
        showText: true,
        retry: 'one',
        lockCorrect: true,
        showWhy: 'wrong',
        revealKey: true,
        passThreshold: 70,
        progress: true,
      },
    };
    const groupKey = {
      rows: {
        r1: { answer: 'c1', why: 'Første setning.', quote: 'Bartek er snekker.' },
        r2: { answer: 'c2', why: 'Bergen, ikke Oslo.', quote: 'Han søker en ny jobb i Bergen.' },
        // r3 is written but never marked — it must not reach the student.
      },
    };

    type GroupProjection = {
      columns: Array<{ id: string; label: string }>;
      rows: Array<{ id: string; text: string }>;
      source: { text?: string };
    };

    it('ships no column key, no explanation and no quote, even in PRACTICE mode', async () => {
      const handler = makeHandler('multiple_choice_group', groupContent, groupKey);
      const result = await handler.execute(practice);

      expect(result.value.expectedAnswers).toBeNull();
      const serialised = JSON.stringify(result.value.exerciseContent);
      expect(serialised).not.toContain('answer');
      expect(serialised).not.toContain('Bergen, ikke Oslo');
      // The quote check has to be structural rather than a search for its text: a quote
      // is a line *of the passage*, which the projection is supposed to send. What must
      // not travel is the field that says which line proves which statement.
      expect(serialised).not.toContain('quote');
    });

    it('drops the statement the author never marked', async () => {
      const handler = makeHandler('multiple_choice_group', groupContent, groupKey);
      const projection = (await handler.execute(practice)).value
        .exerciseContent as GroupProjection;

      expect(projection.rows.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('deals the row order from the attempt, and never the columns', async () => {
      const handler = makeHandler('multiple_choice_group', groupContent, groupKey);
      const result = (await handler.execute(practice)).value;
      const projection = result.exerciseContent as GroupProjection;

      const expected = mcgToStudentProjection(groupContent, groupKey, (items) =>
        mcgShuffled(items, seedFrom(result.attemptId)),
      ) as unknown as GroupProjection;

      expect(projection.rows.map((r) => r.id)).toEqual(expected.rows.map((r) => r.id));
      expect(projection.columns.map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('hands on a document of the old form as it stands', async () => {
      const old = {
        context: 'Tekst 1A',
        options: [
          { id: 'r', text: 'Riktig' },
          { id: 'g', text: 'Galt' },
        ],
        items: [{ id: '1', question: 'Bartek er snekker.' }],
      };
      const key = { items: [{ id: '1', correct_option_ids: ['r'] }] };
      const handler = makeHandler('multiple_choice_group', old, key);

      const result = await handler.execute(practice);
      expect(result.value.exerciseContent).toEqual(old);
      expect(result.value.expectedAnswers).toEqual(key);
    });

    it('hands on an envelope whose key has already been taken away', async () => {
      // The second pass has no key left to ask which rows are finished, so projecting
      // again would return an empty table rather than a smaller one.
      const alreadyProjected = {
        instruction: groupContent.instruction,
        source: { mode: 'inline', label: 'Bartek', text: groupContent.source.text },
        columns: [
          { id: 'c1', label: 'Riktig' },
          { id: 'c2', label: 'Galt' },
        ],
        rows: [{ id: 'r2', text: 'Bartek søker jobb i Oslo.' }, { id: 'r1', text: 'Bartek er snekker.' }],
        settings: { numbering: true, layout: 'auto', retry: 'one', progress: true, showText: true, passThreshold: 70 },
      };
      const handler = makeHandler('multiple_choice_group', alreadyProjected, null);

      const result = await handler.execute(practice);
      expect(result.value.exerciseContent).toEqual(alreadyProjected);
      expect(result.value.expectedAnswers).toBeNull();
    });

    it('in GRADED mode fetches the unprojected document so the deal belongs to the attempt', async () => {
      const alreadyProjected = {
        instruction: groupContent.instruction,
        source: { mode: 'inline', label: 'Bartek', text: groupContent.source.text },
        columns: [
          { id: 'c1', label: 'Riktig' },
          { id: 'c2', label: 'Galt' },
        ],
        rows: [{ id: 'r2', text: 'Bartek søker jobb i Oslo.' }, { id: 'r1', text: 'Bartek er snekker.' }],
        settings: { numbering: true, layout: 'auto', retry: 'one', progress: true, showText: true, passThreshold: 70 },
      };
      const { handler, modes } = makeHandlerByMode('multiple_choice_group', (mode) =>
        mode === 'PRACTICE'
          ? { content: groupContent, expectedAnswers: groupKey }
          : { content: alreadyProjected, expectedAnswers: null },
      );

      const result = (await handler.execute(graded)).value;

      expect(modes).toEqual(['GRADED', 'PRACTICE']);
      const projection = result.exerciseContent as GroupProjection;
      const expected = mcgToStudentProjection(groupContent, groupKey, (items) =>
        mcgShuffled(items, seedFrom(result.attemptId)),
      ) as unknown as GroupProjection;
      expect(projection.rows.map((r) => r.id)).toEqual(expected.rows.map((r) => r.id));
      expect(result.expectedAnswers).toBeNull();
      expect(JSON.stringify(result.exerciseContent)).not.toContain('Bergen, ikke Oslo');
    });
  });

  describe('multiple_choice', () => {
    // Plan 53 §3.2 and §3.4. Nothing in the content column says which option is right —
    // the key is a map in the other column — so what has to be got right here is the
    // dealing: the order is the server's, and it must be the *attempt's* rather than a
    // fresh throw, because that is the order the 50/50 will be counted in.
    const choiceContent = {
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
            { id: 'o4', text: 'Ingen av disse', fixed: true },
          ],
        },
      ],
      settings: { shuffle: true, letters: true, retry: 'one', eliminate: true },
    };
    const choiceKey = {
      questions: {
        q1: {
          correctOptionId: 'o1',
          why: 'Presens flyttes til preteritum.',
          options: { o2: 'Presens holder seg ikke.' },
        },
      },
    };

    type Projection = {
      questions: Array<{ id: string; options: Array<{ id: string; text: string }> }>;
      settings: Record<string, unknown>;
    };

    it('ships no key, no rule and no rebuttal, even in PRACTICE mode', async () => {
      const handler = makeHandler('multiple_choice', choiceContent, choiceKey);
      const result = await handler.execute(practice);

      expect(result.value.expectedAnswers).toBeNull();
      const serialised = JSON.stringify(result.value.exerciseContent);
      expect(serialised).not.toContain('correctOptionId');
      expect(serialised).not.toContain('Presens flyttes');
      expect(serialised).not.toContain('Presens holder seg');
    });

    it('deals the options and pins the fixed one last', async () => {
      const handler = makeHandler('multiple_choice', choiceContent, choiceKey);
      const projection = (await handler.execute(practice)).value.exerciseContent as Projection;
      const options = projection.questions[0]!.options;

      expect(options.map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3', 'o4']);
      expect(options[options.length - 1]!.id).toBe('o4');
    });

    it('deals the same order twice for the same attempt', async () => {
      // The seed is the attempt (plan 53 §3.4): a reload must not re-deal the card the
      // student is looking at, or the judge and the screen number the options apart.
      const handler = makeHandler('multiple_choice', choiceContent, choiceKey);
      const first = (await handler.execute(practice)).value;
      const order = (attemptId: string) => {
        const shuffle = attemptShuffle(attemptId);
        return (mcToStudentProjection(choiceContent, shuffle) as Projection).questions[0]!.options
          .map((o) => o.id)
          .join(',');
      };

      expect(order(first.attemptId)).toBe(
        (first.exerciseContent as Projection).questions[0]!.options.map((o) => o.id).join(','),
      );
    });

    it('hands on a document already projected by content-service without dealing again', async () => {
      // Plan 53 §6.2: in `graded` mode the key is gone, and a second pass would re-deal
      // the options the student has already been shown.
      const alreadyProjected = {
        instruction: choiceContent.instruction,
        questions: [
          {
            id: 'q1',
            kind: 'grammar',
            stem: choiceContent.questions[0]!.stem,
            options: [
              { id: 'o3', text: 'har vært' },
              { id: 'o1', text: 'var' },
              { id: 'o2', text: 'er' },
              { id: 'o4', text: 'Ingen av disse' },
            ],
          },
        ],
        settings: { letters: true, layout: 'list', instant: false, retry: 'one', eliminate: true, progress: true },
      };
      const handler = makeHandler('multiple_choice', alreadyProjected, null);

      const result = await handler.execute(practice);

      expect(result.value.exerciseContent).toEqual(alreadyProjected);
      expect(result.value.expectedAnswers).toBeNull();
    });

    describe('in GRADED mode the deal still belongs to the attempt (plan 53 §8 Q7)', () => {
      // What content-service ships in `graded` mode: already projected, key gone, and
      // dealt with a CSPRNG whose result is then cached by (exercise, language, mode) —
      // so the order belongs to a five-minute Redis entry rather than to this attempt.
      // The fix is the arrangement `submit-answer`, `reveal-answers` and
      // `answer-question` already use: ask for the document as PRACTICE and deal here.
      const alreadyProjected = {
        instruction: choiceContent.instruction,
        questions: [
          {
            id: 'q1',
            kind: 'grammar',
            stem: choiceContent.questions[0]!.stem,
            options: [
              { id: 'o3', text: 'har vært' },
              { id: 'o1', text: 'var' },
              { id: 'o2', text: 'er' },
              { id: 'o4', text: 'Ingen av disse' },
            ],
          },
        ],
        settings: { letters: true, layout: 'list', instant: false, retry: 'one', eliminate: true, progress: true },
      };

      const byMode: DefinitionByMode = (mode) =>
        mode === 'PRACTICE'
          ? { content: choiceContent, expectedAnswers: choiceKey }
          : { content: alreadyProjected, expectedAnswers: null };

      it('fetches the unprojected document and deals it with the attempt seed', async () => {
        const { handler, modes } = makeHandlerByMode('multiple_choice', byMode);

        const result = (await handler.execute(graded)).value;

        expect(modes).toEqual(['GRADED', 'PRACTICE']);
        const dealt = (result.exerciseContent as Projection).questions[0]!.options
          .map((o) => o.id)
          .join(',');
        const expected = (
          mcToStudentProjection(choiceContent, attemptShuffle(result.attemptId)) as Projection
        ).questions[0]!.options
          .map((o) => o.id)
          .join(',');
        expect(dealt).toBe(expected);
        // The key was in hand to deal from and still does not travel.
        expect(result.expectedAnswers).toBeNull();
        expect(JSON.stringify(result.exerciseContent)).not.toContain('Presens flyttes');
      });

      it('pins the fixed option last, as the first deal did', async () => {
        const { handler } = makeHandlerByMode('multiple_choice', byMode);
        const projection = (await handler.execute(graded)).value.exerciseContent as Projection;
        const options = projection.questions[0]!.options;

        expect(options.map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3', 'o4']);
        expect(options[options.length - 1]!.id).toBe('o4');
      });

      it('hands on the projected envelope when the second fetch fails', async () => {
        // A worse card than the attempt should have, rather than no card at all.
        const { handler, modes } = makeHandlerByMode('multiple_choice', (mode) =>
          mode === 'PRACTICE' ? null : { content: alreadyProjected, expectedAnswers: null },
        );

        const result = (await handler.execute(graded)).value;

        expect(modes).toEqual(['GRADED', 'PRACTICE']);
        expect(result.exerciseContent).toEqual(alreadyProjected);
        expect(result.expectedAnswers).toBeNull();
      });

      it('does not fetch twice for a document of the old form', async () => {
        const old = {
          question: 'Han sa at han ___ sliten.',
          options: [
            { id: 'a', text: 'var' },
            { id: 'b', text: 'er' },
          ],
        };
        const { handler, modes } = makeHandlerByMode('multiple_choice', () => ({
          content: old,
          expectedAnswers: null,
        }));

        const result = (await handler.execute(graded)).value;

        expect(modes).toEqual(['GRADED']);
        expect(result.exerciseContent).toEqual(old);
      });

      it('does not fetch twice for any other template', async () => {
        // The second fetch is `multiple_choice`'s alone: no other projection deals an
        // order that has to belong to the attempt.
        const { handler, modes } = makeHandlerByMode('writing_task', () => ({
          content: writingContent,
          expectedAnswers: null,
        }));

        await handler.execute(graded);

        expect(modes).toEqual(['GRADED']);
      });
    });

    it('hands on a document of the old form, rather than blanking it', async () => {
      // Plan 53 §8 Q2 leaves 121 of them live, and PRACTICE has always shipped their
      // key. Projecting one would find no `questions` and empty the exercise.
      const old = {
        question: 'Han sa at han ___ sliten.',
        options: [
          { id: 'a', text: 'var' },
          { id: 'b', text: 'er' },
        ],
      };
      const key = { correct_option_ids: ['a'] };
      const handler = makeHandler('multiple_choice', old, key);

      const result = await handler.execute(practice);
      expect(result.value.exerciseContent).toEqual(old);
      expect(result.value.expectedAnswers).toEqual(key);
    });
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

// AC-S11 of plan 66, asserted on the server as the spec demands: the payload a student
// receives carries no bucket per item, no `also`, no `why` and no feedback. Structural —
// the answer for `bil` is the string `en`, which is also a bucket label the student is
// supposed to see, so a search for the answer text could not tell a leak from the board.
describe('StartAttemptHandler — sort_into_buckets', () => {
  const sortContent = {
    title: 'Kjønn',
    instruction: 'Sorter substantivene.',
    buckets: [
      { id: 'b1', label: 'en', rule: 'Hankjønn. Bestemt form -en.' },
      { id: 'b2', label: 'et', rule: 'Intetkjønn.' },
    ],
    useNone: true,
    noneLabel: 'Ingen av delene',
    items: [
      { id: 'i1', text: 'bil' },
      { id: 'i2', text: 'hus' },
      { id: 'i3', text: 'gutt' },
      { id: 'i4', text: 'eple' },
      { id: 'i5', text: 'stol' },
    ],
    settings: { shuffle: true, showRemaining: false, hints: true, revealKey: true, attempts: 0, threshold: 70 },
  };
  const sortKey = {
    items: {
      i1: { bucketId: 'b1', also: [], why: 'En bil.', fb: { def: 'Hankjønn.', ov: { b2: 'Ikke et.' } } },
      i2: { bucketId: 'b2', also: ['b1'], why: 'Et hus.', fb: { def: 'Intetkjønn.', ov: {} } },
      i3: { bucketId: 'b1', also: [], why: 'En gutt.', fb: { def: 'Hankjønn.', ov: {} } },
      i4: { bucketId: 'b2', also: [], why: 'Et eple.', fb: { def: 'Intetkjønn.', ov: {} } },
      // i5 is written but never assigned — it must not reach the student.
    },
  };

  type Projection = {
    buckets: Array<Record<string, unknown>>;
    items: Array<Record<string, unknown>>;
    settings: Record<string, unknown>;
  };

  it('ships items as id and text and buckets as id, label and hint — nothing that decides them', async () => {
    const handler = makeHandler('sort_into_buckets', sortContent, sortKey);
    const result = (await handler.execute(practice)).value;

    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    for (const item of projection.items) expect(Object.keys(item).sort()).toEqual(['id', 'text']);
    for (const bucket of projection.buckets) {
      expect(Object.keys(bucket).every((k) => ['id', 'label', 'hint'].includes(k))).toBe(true);
    }
    const serialised = JSON.stringify(result.exerciseContent);
    for (const field of ['bucketId', 'also', 'why', 'fb', 'def', 'ov', 'rule']) {
      expect(serialised).not.toContain(`"${field}"`);
    }
  });

  it('drops the item the author never assigned', async () => {
    const handler = makeHandler('sort_into_buckets', sortContent, sortKey);
    const projection = (await handler.execute(practice)).value.exerciseContent as Projection;
    expect(projection.items.map((i) => i.id).sort()).toEqual(['i1', 'i2', 'i3', 'i4']);
  });

  it('deals the pool from the attempt, and never moves the buckets', async () => {
    const handler = makeHandler('sort_into_buckets', sortContent, sortKey);
    const result = (await handler.execute(practice)).value;
    const projection = result.exerciseContent as Projection;

    const expected = sbToStudentProjection(sortContent, sortKey, (items) =>
      sbShuffled(items, seedFrom(result.attemptId)),
    );
    expect(projection.items.map((i) => i.id)).toEqual(expected.items.map((i) => i.id));
    expect(projection.buckets.map((b) => b.id)).toEqual(['b1', 'b2', 'none']);
  });

  it('in GRADED mode fetches the unprojected document so the deal belongs to the attempt', async () => {
    const alreadyProjected = sbToStudentProjection(sortContent, sortKey);
    const { handler, modes } = makeHandlerByMode('sort_into_buckets', (mode) =>
      mode === 'PRACTICE'
        ? { content: sortContent, expectedAnswers: sortKey }
        : { content: alreadyProjected, expectedAnswers: null },
    );

    const result = (await handler.execute(graded)).value;

    expect(modes).toEqual(['GRADED', 'PRACTICE']);
    const expected = sbToStudentProjection(sortContent, sortKey, (items) =>
      sbShuffled(items, seedFrom(result.attemptId)),
    );
    expect((result.exerciseContent as Projection).items.map((i) => i.id)).toEqual(
      expected.items.map((i) => i.id),
    );
    expect(result.expectedAnswers).toBeNull();
  });
});

describe('StartAttemptHandler — highlight_in_text', () => {
  // Plan 67, AC-S11 on the server: the passage, its paragraphs and per ready question its
  // id, prompt, unit and count — nothing that decides an answer. Asserted by key sets: the
  // answer to «mark the past tense» is a word of the passage the student is meant to read,
  // so a search for the answer text could not tell a leak from the text.
  const htContent = {
    title: 'Preteritum',
    instruction: 'Les teksten og marker det oppgaven spør om.',
    text: 'I fjor sommer reiste vi til Bodø.\n\nVi bodde hos tante Kari.',
    questions: [
      { id: 'q1', prompt: 'Marker verbene i preteritum.', unit: 'word' },
      // Written but never marked — it must not reach the student.
      { id: 'q2', prompt: 'Marker stedene.', unit: 'word' },
    ],
    settings: { attempts: 2, threshold: 80, penalty: 'full', showCount: true, hints: true, revealKey: true },
  };
  const htKey = {
    questions: {
      q1: {
        spans: [
          { id: 's1', start: 14, end: 20, why: 'Preteritum av «reise».' },
          { id: 's2', start: 38, end: 43, why: '' },
        ],
        missHint: 'Se etter verb som forteller hva som skjedde.',
        fpHint: '«Bodø» er et sted.',
      },
      q2: { spans: [], missHint: '', fpHint: '' },
    },
    orphans: [{ id: 'o1', qid: 'q1', surface: 'kjørte', why: 'Gammelt verb.' }],
  };

  type Projection = Record<string, unknown> & {
    questions: Array<Record<string, unknown>>;
    settings: Record<string, unknown>;
  };

  it('ships the passage and ready questions as id, prompt, unit and count — nothing that decides them', async () => {
    const handler = makeHandler('highlight_in_text', htContent, htKey);
    const result = (await handler.execute(practice)).value;

    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    expect(Object.keys(projection).sort()).toEqual(['instruction', 'paragraphs', 'questions', 'settings', 'text']);
    expect(projection.questions).toEqual([
      { id: 'q1', prompt: 'Marker verbene i preteritum.', unit: 'word', count: 2 },
    ]);
    expect(Object.keys(projection.settings).sort()).toEqual(['attempts', 'hints', 'revealKey']);

    const serialised = JSON.stringify(result.exerciseContent);
    for (const field of ['spans', 'why', 'missHint', 'fpHint', 'orphans', 'threshold', 'penalty']) {
      expect(serialised).not.toContain(`"${field}"`);
    }
    for (const secret of ['Preteritum av', 'Se etter verb', 'er et sted', 'kjørte']) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('in GRADED mode hands on the envelope content-service already projected, under graded settings (Q8-A)', async () => {
    const alreadyProjected = htToStudentProjection(htContent, htKey);
    const { handler, modes } = makeHandlerByMode('highlight_in_text', () => ({
      content: alreadyProjected,
      expectedAnswers: null,
    }));

    const result = (await handler.execute(graded)).value;

    // Nothing is dealt, so nothing is fetched again — and the questions are not emptied.
    expect(modes).toEqual(['GRADED']);
    expect(result.exerciseContent).toEqual({
      ...alreadyProjected,
      // One check per question, no hint, no reveal — what the server will allow.
      settings: { attempts: 1, hints: false, revealKey: false },
    });
    expect(result.expectedAnswers).toBeNull();
  });
});

describe('StartAttemptHandler — dictation', () => {
  // Plan 68, AC-R3 and AC-X2 on the server: per ready segment its id — and its word count
  // only under `showWordCount` — the instruction, the shape and the settings the runner draws
  // buttons from; the audio layer adds the clip and the segments' timecodes. Asserted by key
  // sets and by searching for every secret the key column holds.
  const doc = (showWordCount: boolean) => {
    const base = dcEmptyContent('nb', 'Hør og skriv.');
    return {
      ...base,
      title: 'Diktat',
      audio: { ...base.audio, assetId: 'asset-1', title: 'Klipp', duration: 20, transcript: 'Hele klippet.' },
      segments: [
        {
          id: 'a',
          text: 'På kjøkkenet står det en skje.',
          audio: { start: 0, end: 7 },
          why: 'Stum k foran j.',
          focus: [{ id: 'f1', wordIndex: 1, why: 'kj- foran ø.' }],
        },
        // Not written yet — it must not reach the student.
        { id: 'b', text: '', audio: { start: 7, end: 14 }, why: '', focus: [] },
      ],
      orphans: [{ id: 'o1', segmentId: 'a', surface: 'skjeen', why: 'Bestemt form.' }],
      settings: { ...base.settings, showWordCount },
    };
  };
  const SECRETS = ['kjøkkenet', 'Stum k', 'kj- foran', 'skjeen', 'Bestemt form', 'Hele klippet'];

  type Projection = Record<string, unknown> & {
    segments: Array<Record<string, unknown>>;
    settings: Record<string, unknown>;
    audio: Record<string, unknown>;
  };

  it('ships ready segments as their id, with the timecodes on the audio block — nothing of the key', async () => {
    const d = doc(false);
    const handler = makeHandler('dictation', dcToContent(d), dcToExpectedAnswers(d));
    const result = (await handler.execute(practice)).value;

    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    expect(Object.keys(projection).sort()).toEqual(['audio', 'instruction', 'mode', 'segments', 'settings']);
    expect(projection.segments).toEqual([{ id: 'a' }]);
    expect(Object.keys(projection.settings).sort()).toEqual(['attempts', 'hints', 'revealKey', 'showWordCount']);
    expect(projection.audio['transcript']).toBe('');

    const serialised = JSON.stringify(result.exerciseContent);
    for (const field of ['text', 'why', 'focus', 'orphans', 'marking', 'threshold', 'language', 'wordCount']) {
      expect(serialised).not.toContain(`"${field}"`);
    }
    for (const secret of SECRETS) expect(serialised).not.toContain(secret);
  });

  it('carries the word count only under showWordCount (AC-R3)', async () => {
    const d = doc(true);
    const handler = makeHandler('dictation', dcToContent(d), dcToExpectedAnswers(d));
    const projection = (await handler.execute(practice)).value.exerciseContent as Projection;

    expect(projection.segments).toEqual([{ id: 'a', wordCount: 6 }]);
  });

  it('in GRADED mode hands on the envelope content-service already projected, under graded settings (Q8-A)', async () => {
    const d = doc(false);
    const alreadyProjected = dcToStudentProjection(dcToContent(d), dcToExpectedAnswers(d));
    const { handler, modes } = makeHandlerByMode('dictation', () => ({
      content: alreadyProjected,
      expectedAnswers: null,
    }));

    const result = (await handler.execute(graded)).value;

    expect(modes).toEqual(['GRADED']);
    expect((result.exerciseContent as Projection).segments).toEqual([{ id: 'a' }]);
    expect((result.exerciseContent as Projection).settings).toEqual({
      attempts: 1,
      hints: false,
      revealKey: false,
      showWordCount: false,
    });
    expect(result.expectedAnswers).toBeNull();
  });
});

describe('StartAttemptHandler — inflection_table', () => {
  // Plan 69, IT-X2 on the server: per row its id, lemma and gloss, per cell the given form or
  // the fact that it is asked — nothing that decides a cell. Asserted by key sets as well as by
  // search: a key form may legitimately appear as a given form in another row, or in the bank.
  const withBank = (table: InflectionTableContent) =>
    itUpdateInput(itUpdateSettings(table, { hintFirstLetter: true, revealKey: 'afterFirst', attempts: 3 }), {
      mode: 'bank',
      shuffleRows: true,
    });
  const columns = (table: InflectionTableContent) => ({
    content: itToContent(table),
    expectedAnswers: itToExpectedAnswers(table),
  });

  type Projection = {
    rows: Array<{ id: string; cells: Record<string, Record<string, unknown>> } & Record<string, unknown>>;
    bank?: string[];
    settings: Record<string, unknown>;
  } & Record<string, unknown>;

  it('ships rows and cells with nothing that decides them, and no pass mark (IT-X2)', async () => {
    const { content, expectedAnswers } = columns(itSampleContent());
    const result = (await makeHandler('inflection_table', content, expectedAnswers).execute(practice)).value;

    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    expect(Object.keys(projection).sort()).toEqual(['instruction', 'language', 'paradigm', 'rows', 'settings', 'slots']);
    for (const row of projection.rows) {
      expect(Object.keys(row).sort()).toEqual(['cells', 'gloss', 'id', 'lemma']);
      for (const cell of Object.values(row.cells)) {
        expect(cell.mode === 'ask' ? Object.keys(cell) : Object.keys(cell).sort()).toEqual(
          cell.mode === 'ask' ? ['mode'] : ['mode', 'value'],
        );
      }
    }
    expect(Object.keys(projection.settings).sort()).toEqual(['attempts', 'input', 'revealKey', 'rowVerdict']);
    const serialised = JSON.stringify(projection);
    for (const field of ['accept', 'why', 'dictId', 'packVersion', 'threshold', 'hintFirstLetter']) {
      expect(serialised).not.toContain(`"${field}"`);
    }
    // A variant accepted in one cell, and a reason, are nowhere.
    expect(serialised).not.toContain('boken');
    expect(serialised).not.toContain('Omlyd');
  });

  it('deals the rows and the bank from the attempt, and never moves the columns (§3.3)', async () => {
    const { content, expectedAnswers } = columns(withBank(itSampleContent()));
    const result = (await makeHandler('inflection_table', content, expectedAnswers).execute(practice)).value;
    const projection = result.exerciseContent as Projection;

    const expected = itToStudentProjection(content, expectedAnswers, (items) => sbShuffled(items, seedFrom(result.attemptId)));
    expect(projection.rows.map((r) => r.id)).toEqual(expected.rows.map((r) => r.id));
    expect(projection.bank).toEqual(expected.bank);
    expect((projection.slots as Array<{ id: string }>).map((s) => s.id)).toEqual(['indefSg', 'defSg', 'indefPl', 'defPl']);
    // The hint is the key's first letter, and travels only because the author turned it on.
    expect(projection.rows.find((r) => r.id === 'r2')!.cells['defSg']).toEqual({ mode: 'ask', hint: 'b' });
  });

  it('in GRADED mode deals from the unprojected document, under graded settings — no hint, one check, no key', async () => {
    const table = withBank(itSampleContent());
    const { content, expectedAnswers } = columns(table);
    const alreadyProjected = itToStudentProjection(content, expectedAnswers);
    const { handler, modes } = makeHandlerByMode('inflection_table', (mode) =>
      mode === 'PRACTICE' ? { content, expectedAnswers } : { content: alreadyProjected, expectedAnswers: null },
    );

    const result = (await handler.execute(graded)).value;

    expect(modes).toEqual(['GRADED', 'PRACTICE']);
    expect(result.expectedAnswers).toBeNull();
    const projection = result.exerciseContent as Projection;
    const expected = itToStudentProjection(content, expectedAnswers, (items) => sbShuffled(items, seedFrom(result.attemptId)));
    expect(projection.rows.map((r) => r.id)).toEqual(expected.rows.map((r) => r.id));
    expect(projection.settings).toMatchObject({ attempts: 1, revealKey: 'never', input: 'bank' });
    expect(JSON.stringify(projection.rows)).not.toContain('"hint"');
  });

  it('in GRADED mode hands on an envelope it cannot re-fetch as it stands, still under graded settings', async () => {
    const table = withBank(itSampleContent());
    const { content, expectedAnswers } = columns(table);
    const alreadyProjected = itToStudentProjection(content, expectedAnswers);
    const { handler } = makeHandlerByMode('inflection_table', (mode) =>
      mode === 'PRACTICE' ? null : { content: alreadyProjected, expectedAnswers: null },
    );

    const result = (await handler.execute(graded)).value;

    const projection = result.exerciseContent as Projection;
    expect(projection.rows).toHaveLength(4);
    expect(projection.settings).toMatchObject({ attempts: 1, revealKey: 'never' });
    expect(JSON.stringify(projection.rows)).not.toContain('"hint"');
  });

  // Plan 69, phase 9: a whole board is scored by its first check, so it is never IN_PROGRESS
  // between checks. An open one is handed back as it stands — same attempt, same dealt board,
  // and the check the learner already saw — rather than starting over with a fresh budget.
  describe('an open board', () => {
    const scored = (details: unknown) =>
      Attempt.reconstitute({
        id: 'attempt-board',
        userId: 'user-1',
        exerciseId: 'ex-1',
        assignmentId: null,
        enrollmentId: null,
        templateCode: 'inflection_table',
        targetLanguage: 'no',
        difficultyLevel: 'B1',
        checkMode: 'PRACTICE',
        practicedAtoms: [],
        status: 'SCORED',
        score: 83,
        passed: true,
        timeSpentSeconds: 12,
        submittedAnswer: null,
        validationDetails: details,
        feedback: null,
        answerHash: null,
        revisionCount: 0,
        answersRevealed: false,
        selfChecksUsed: 0,
        startedAt: new Date(),
        submittedAt: null,
        scoredAt: new Date(),
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
        totalItems: 12,
        answeredQuestions: [],
        checkedRows: [],
      } as any);

    const check = { attempt: 1, checksLeft: 1, closed: false, locked: ['r1:defSg'], items: [], rows: [] };

    it('resumes the scored attempt with the check it ended on', async () => {
      const { content, expectedAnswers } = columns(itSampleContent());
      const { handler, attempts } = makeHandlerByMode('inflection_table', () => ({ content, expectedAnswers }));
      attempts.findOpenBoard.mockResolvedValue(scored(check) as never);

      const result = (await handler.execute(practice)).value;

      expect(result.attemptId).toBe('attempt-board');
      expect(result.boardCheck).toEqual(check);
      expect(attempts.save).not.toHaveBeenCalled();
      // The same board: dealt from the attempt's own id, like the first time.
      const expected = itToStudentProjection(content, expectedAnswers, (items) => sbShuffled(items, seedFrom('attempt-board')));
      expect((result.exerciseContent as Projection).rows.map((r) => r.id)).toEqual(expected.rows.map((r) => r.id));
    });

    it('starts afresh, with no check to show, when nothing is open', async () => {
      const { content, expectedAnswers } = columns(itSampleContent());
      const { handler, attempts } = makeHandlerByMode('inflection_table', () => ({ content, expectedAnswers }));

      const result = (await handler.execute(practice)).value;

      expect(attempts.findOpenBoard).toHaveBeenCalledWith('user-1', 'ex-1');
      expect(result.boardCheck).toBeNull();
      expect(attempts.save).toHaveBeenCalled();
    });
  });
});
