import { sampleDocument, toContent, toExpectedAnswers } from '@ssz/shared-kernel/read-aloud';
import { GetReviewSubjectHandler } from '../../../src/modules/ai-drafts/application/queries/get-review-subject/get-review-subject.handler.js';
import { GetReviewSubjectQuery } from '../../../src/modules/ai-drafts/application/queries/get-review-subject/get-review-subject.query.js';
import type { IAttemptAiDraftRepository } from '../../../src/modules/ai-drafts/domain/repositories/attempt-ai-draft.repository.js';
import type { AttemptStatus } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import type { IAttemptRepository } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  ContentClientError,
  type IContentClient,
} from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 79, step 1.3.

const SNAPSHOT_CRITERION = { id: 'c1', name: 'Språk', desc: '', weight: 1, levels: ['a', 'b', 'c', 'd'] };

const ATTEMPT = 'a0000000-0000-4000-8000-000000000001';

const CONTENT = {
  dir: 'both',
  langs: { explain: 'Russisk', target: 'Norsk' },
  format: 'set',
  items: [
    { id: 's1', dir: 'to_target', source: 'Я живу здесь три года.', gloss: [] },
    { id: 's2', dir: 'from_target', source: 'Hun leser en bok.', gloss: [] },
    { id: 'blank', dir: 'to_target', source: '  ', gloss: [] },
  ],
  ai: { on: true, checks: { grammar: true, order: false, lexis: true, register: false }, visibility: 'teacher' },
};

const ANSWERS = {
  items: {
    s1: { refs: ['Jeg har bodd her i tre år', ' '], explanation: 'Perfektum med «i tre år».', teacherNote: '' },
    s2: { refs: ['Она читает книгу'] },
  },
};

interface Setup {
  attempt?: { status: AttemptStatus; schoolId: string | null; templateCode: string; rubricSnapshot?: unknown; reviewAiPolicy?: unknown } | null;
  draft?: boolean;
  content?: 'ok' | 404 | 503;
  submitted?: unknown;
  exercise?: { content: unknown; expectedAnswers: unknown };
}

function setup({ attempt, draft = false, content = 'ok', submitted, exercise }: Setup = {}) {
  const row =
    attempt === null
      ? null
      : {
          id: ATTEMPT,
          userId: 'learner-1',
          exerciseId: 'ex-1',
          targetLanguage: 'nb',
          status: 'ROUTED_FOR_REVIEW' as AttemptStatus,
          schoolId: 'school-1',
          templateCode: 'translate_to_target',
          submittedAnswer: submitted ?? { answers: [{ itemId: 's1', text: 'Jeg bor her i tre år' }] },
          rubricSnapshot: null,
          ...attempt,
        };
  const attempts = { findById: async () => row } as unknown as IAttemptRepository;
  const drafts = { findByAttempt: async () => (draft ? { id: 'd1' } : null) } as unknown as IAttemptAiDraftRepository;
  const reads: string[] = [];
  const contentClient = {
    getExerciseForAttempt: async (id: string, lang: string, mode: string) => {
      reads.push(`${id}:${lang}:${mode}`);
      if (content !== 'ok') return Result.fail(new ContentClientError(content, 'nope'));
      return Result.ok({ exercise: exercise ?? { content: CONTENT, expectedAnswers: ANSWERS } });
    },
  } as unknown as IContentClient;
  return { handler: new GetReviewSubjectHandler(attempts, drafts, contentClient), reads };
}

const run = (
  handler: GetReviewSubjectHandler,
  capability: 'review_draft' | 'review_direct' | 'voice_review' = 'review_draft',
) =>
  handler.execute(new GetReviewSubjectQuery(ATTEMPT, capability));

describe('GetReviewSubjectHandler', () => {
  it('reads the submission beside its key, through the template model', async () => {
    const { handler, reads } = setup();
    const result = await run(handler);

    expect(reads).toEqual(['ex-1:nb:PRACTICE']);
    expect(result.value.skip).toBeNull();
    expect(result.value).toMatchObject({ attemptId: ATTEMPT, userId: 'learner-1', schoolId: 'school-1' });
    expect(result.value.subject).toEqual({
      template: 'translate',
      langs: { explain: 'Russisk', target: 'Norsk' },
      ai: { on: true, checks: { grammar: true, order: false, lexis: true, register: false } },
      sentences: [
        {
          itemId: 's1',
          direction: 'to_target',
          source: 'Я живу здесь три года.',
          refs: ['Jeg har bodd her i tre år'],
          answer: 'Jeg bor her i tre år',
          explanation: 'Perfektum med «i tre år».',
        },
        // Unanswered: still in the set, with an empty answer.
        { itemId: 's2', direction: 'from_target', source: 'Hun leser en bok.', refs: ['Она читает книгу'], answer: '' },
      ],
    });
  });

  it('accepts the old bare-array submission', async () => {
    const { handler } = setup({ submitted: [{ itemId: 's2', text: 'Она читает книгу' }] });
    const result = await run(handler);
    expect(result.value.subject!.sentences.map((s) => s.answer)).toEqual(['', 'Она читает книгу']);
  });

  // Plan 79, step 1.7.
  it('reads an error_correction submission through its engine: the built sentence and each mistake', async () => {
    const { handler } = setup({
      attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: 'school-1', templateCode: 'error_correction' },
      submitted: { items: { e1: { marked: { '1': true }, fix: { '1': 'dro' }, ins: {} } } },
      exercise: {
        content: {
          mode: 'sentences',
          note: 'Fortid.',
          items: [
            { id: 'e1', wrong: 'Jeg går på kino i går' },
            { id: 'e2', wrong: 'Han bo i Oslo' },
            { id: 'empty', wrong: ' ' },
          ],
          ai: { on: true, checks: { explainWhy: true, altFixes: true, register: false }, visibility: 'teacher' },
        },
        expectedAnswers: {
          items: {
            e1: { ref: 'Jeg gikk på kino i går', alts: [' '], meta: {}, teacherNote: 'Preteritum.' },
            e2: { ref: 'Han bor i Oslo', alts: [], meta: { '1:2:bor': { note: 'Presens av «bo».' } } },
          },
        },
      },
    });
    const result = await run(handler);

    expect(result.value.skip).toBeNull();
    expect(result.value.subject).toEqual({
      template: 'error_correction',
      targetLanguage: 'nb',
      note: 'Fortid.',
      ai: { on: true, checks: { explainWhy: true, altFixes: true, register: false } },
      sentences: [
        {
          itemId: 'e1',
          given: 'Jeg går på kino i går',
          refs: ['Jeg gikk på kino i går'],
          answer: 'Jeg dro på kino i går',
          matchesKey: false,
          mistakes: [{ wrong: 'går', fix: 'gikk', type: 'form', state: 'attempted', submitted: 'dro' }],
          stray: [],
          teacherNote: 'Preteritum.',
        },
        // Untouched: the faulty sentence is the answer, its mistake missed.
        {
          itemId: 'e2',
          given: 'Han bo i Oslo',
          refs: ['Han bor i Oslo'],
          answer: 'Han bo i Oslo',
          matchesKey: false,
          mistakes: [{ wrong: 'bo', fix: 'bor', type: 'form', state: 'missed', submitted: 'bo', note: 'Presens av «bo».' }],
          stray: [],
        },
      ],
    });
  });

  // Plan 79, step 1.7b.
  it('reads a writing_task submission beside its task: points as phrased and ticked, the measured length', async () => {
    const { handler } = setup({
      attempt: {
        status: 'ROUTED_FOR_REVIEW',
        schoolId: 'school-1',
        templateCode: 'writing_task',
        // Frozen when it was queued; the exercise's rubric today is empty (step 1.7c).
        rubricSnapshot: { criteria: [SNAPSHOT_CRITERION], passScore: 2 },
      },
      submitted: { text: 'Hei Kari!\n\nJeg flytter til Bergen i mai.', ticked: ['p2'] },
      exercise: {
        content: {
          mode: 'letter',
          instruction: 'Skriv et brev.',
          prompt: 'Du flytter.',
          source: 'not shown outside retell',
          image: { caption: 'not shown outside picture', alt: '' },
          letter: { register: 'informal', recipient: 'Kari' },
          points: [
            { id: 'p1', text: 'Når du flytter', required: true },
            { id: 'p2', text: 'Hvorfor', required: false },
            { id: 'blank', text: ' ', required: true },
          ],
          phrases: [],
          rubric: [],
          settings: {
            minWords: 50,
            maxWords: 120,
            aiStage: true,
            ai: { grammar: true, task: true, structure: false, lexis: true, draft: true },
          },
        },
        expectedAnswers: {
          points: { p1: { keywords: ['i mai', ' '] }, p2: { keywords: ['fordi'] } },
          rubric: {},
          model: 'Hei Kari! Jeg flytter i mai fordi …',
        },
      },
    });
    const result = await run(handler);

    expect(result.value.skip).toBeNull();
    expect(result.value.subject).toEqual({
      template: 'writing_task',
      targetLanguage: 'nb',
      mode: 'letter',
      instruction: 'Skriv et brev.',
      prompt: 'Du flytter.',
      source: '',
      letter: { register: 'informal', recipient: 'Kari' },
      imageCaption: '',
      points: [
        { text: 'Når du flytter', required: true, keywords: ['i mai'], phrased: true, ticked: false },
        // Ticked, never phrased: the learner's claim and the engine's measure disagree.
        { text: 'Hvorfor', required: false, keywords: ['fordi'], phrased: false, ticked: true },
      ],
      example: 'Hei Kari! Jeg flytter i mai fordi …',
      length: { words: 8, paragraphs: 2, minWords: 50, maxWords: 120 },
      ai: { on: true, checks: { grammar: true, task: true, structure: false, lexis: true, draft: true } },
      rubric: [SNAPSHOT_CRITERION],
      text: 'Hei Kari!\n\nJeg flytter til Bergen i mai.',
    });
  });

  // Plan 79, step 1.7e.
  it('reads a short_answer submission through its grader: answered questions only, key points as found', async () => {
    const { handler } = setup({
      attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: 'school-1', templateCode: 'short_answer' },
      submitted: {
        answers: [
          { questionId: 'q1', text: 'Han flyttet fordi han fikk jobb.' },
          // The author has since deleted the question: nothing to read the answer against.
          { questionId: 'gone', text: 'Noe.' },
        ],
      },
      exercise: {
        content: {
          title: 'Teksten',
          instruction: 'Svar med én til tre setninger.',
          questions: [
            { id: 'q1', kind: 'reading', passage: 'Ali flyttet til Bergen i 2019 fordi han fikk jobb der.', prompt: 'Hvorfor flyttet Ali?' },
            // Skipped by the learner: left out of the subject.
            { id: 'q2', kind: 'opinion', passage: '', prompt: 'Hva synes du?' },
          ],
          settings: { passRule: 'all', minWords: 3, aiStage: true, aiGrammar: false, teacherReview: 'flagged' },
        },
        expectedAnswers: {
          questions: {
            q1: {
              elements: [
                { id: 'e1', label: 'Han fikk jobb', anchors: ['fikk jobb'], required: true },
                { id: 'e2', label: 'I Bergen', anchors: ['i bergen'], required: true },
                { id: 'e3', label: 'Half-written', anchors: [' '], required: true },
              ],
              model: 'Han fikk jobb i Bergen.',
              why: 'Teksten sier at han fikk jobb der.',
            },
            q2: { elements: [{ id: 'e4', label: 'En mening', anchors: ['synes'], required: true }], model: 'Jeg synes …', why: '' },
          },
        },
      },
    });
    const result = await run(handler);

    expect(result.value.skip).toBeNull();
    expect(result.value.subject).toEqual({
      template: 'short_answer',
      targetLanguage: 'nb',
      instruction: 'Svar med én til tre setninger.',
      ai: { on: true, checks: { grammar: false } },
      questions: [
        {
          itemId: 'q1',
          kind: 'reading',
          passage: 'Ali flyttet til Bergen i 2019 fordi han fikk jobb der.',
          prompt: 'Hvorfor flyttet Ali?',
          model: 'Han fikk jobb i Bergen.',
          why: 'Teksten sier at han fikk jobb der.',
          elements: [
            { label: 'Han fikk jobb', required: true, hit: true },
            { label: 'I Bergen', required: true, hit: false },
          ],
          verdict: 'partial',
          tooShort: false,
          answer: 'Han flyttet fordi han fikk jobb.',
        },
      ],
    });
  });

  it('reads an old-form short_answer, then skips it: there are no key points to review by', async () => {
    const { handler, reads } = setup({
      attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: 'school-1', templateCode: 'short_answer' },
      submitted: { text: 'Han bor i Oslo.' },
      exercise: { content: { question: 'Hvor bor han?' }, expectedAnswers: { accepted_answers: ['i Oslo'] } },
    });
    expect((await run(handler)).value).toMatchObject({ skip: 'TEMPLATE_NOT_SUPPORTED', subject: null });
    expect(reads).toEqual(['ex-1:nb:PRACTICE']);
  });

  it.each([
    [{ status: 'SCORED' as AttemptStatus, schoolId: 'school-1', templateCode: 'translate_to_target' }, 'ATTEMPT_NOT_IN_REVIEW'],
    [{ status: 'ROUTED_FOR_REVIEW' as AttemptStatus, schoolId: null, templateCode: 'translate_to_target' }, 'NO_TEACHER_REVIEW'],
    [{ status: 'ROUTED_FOR_REVIEW' as AttemptStatus, schoolId: 'school-1', templateCode: 'dictation' }, 'TEMPLATE_NOT_SUPPORTED'],
  ])('skips %o as %s without reading content', async (attempt, reason) => {
    const { handler, reads } = setup({ attempt });
    const result = await run(handler);
    expect(result.value).toMatchObject({ skip: reason, subject: null });
    expect(reads).toEqual([]);
  });

  // Plan 79, step 2.1b: a direct review is for the learner no teacher reads.
  it('serves a direct review only for work without a school', async () => {
    const school = setup();
    expect((await run(school.handler, 'review_direct')).value).toMatchObject({ skip: 'HAS_TEACHER_REVIEW', subject: null });
    expect(school.reads).toEqual([]);

    const alone = setup({ attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: null, templateCode: 'translate_to_target' } });
    const result = await run(alone.handler, 'review_direct');
    expect(result.value.skip).toBeNull();
    expect(result.value.subject).not.toBeNull();
  });

  // Plan 80: a school that has a model answer first takes the direct review, not the draft.
  it('serves a school’s work under a policy the direct review, and no teacher’s draft', async () => {
    const policy = { mode: 'ai_then_teacher', autoAcceptAt: null, teacherDrawn: false };
    const first = setup({
      attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: 'school-1', templateCode: 'translate_to_target', reviewAiPolicy: policy },
    });
    expect((await run(first.handler, 'review_direct')).value.skip).toBeNull();
    expect((await run(first.handler, 'review_draft')).value.skip).toBe('AI_REVIEWS_FIRST');
  });

  it('skips a submission that already has a draft — a redelivered event stops here', async () => {
    const { handler, reads } = setup({ draft: true });
    expect((await run(handler)).value.skip).toBe('DRAFT_EXISTS');
    expect(reads).toEqual([]);
  });

  it('skips a deleted exercise, but fails on an unreachable content-service', async () => {
    expect((await run(setup({ content: 404 }).handler)).value.skip).toBe('EXERCISE_GONE');
    expect((await run(setup({ content: 503 }).handler)).error).toEqual({ code: 'CONTENT_UNAVAILABLE' });
  });

  it('fails on an unknown attempt', async () => {
    expect((await run(setup({ attempt: null }).handler)).error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });

  // Plan 82, step 6: a reading is checked by ear, and only the voice check is handed it.
  describe('read_aloud', () => {
    const readAloud = (overrides: { carried?: boolean; mode?: 'read' | 'dialogue' } = {}) => {
      const doc = sampleDocument();
      doc.mode = overrides.mode ?? 'read';
      doc.review.aiStage = true;
      doc.review.readingPassPercent = 90;
      const [p1, p2] = doc.prompts;
      const carried = { attemptId: 'a-prev', attempt: 1, marks: {}, points: 9, max: 12, comment: 'Bra.' };
      return setup({
        attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: null, templateCode: 'read_aloud' },
        exercise: { content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) },
        submitted: {
          recordings: [
            { itemId: p1!.id, assetId: 'asset-1', seconds: 21, takes: 2, ...(overrides.carried ? { carried } : {}) },
            { itemId: p2!.id, assetId: 'asset-2', seconds: 12, takes: 1, discarded: [{ assetId: 'asset-3', seconds: 10 }] },
          ],
        },
      });
    };

    it('reads each passage beside the take chosen for it, the pass mark and the author’s switches', async () => {
      const { handler } = readAloud();
      const result = await run(handler, 'voice_review');
      const doc = sampleDocument();
      expect(result.value).toMatchObject({ skip: null, templateCode: 'read_aloud' });
      expect(result.value.subject).toEqual({
        template: 'read_aloud',
        targetLanguage: 'nb',
        passPercent: 90,
        ai: { on: true, checks: { transcript: true, pronunciation: true, fluency: false } },
        prompts: [
          {
            itemId: doc.prompts[0]!.id,
            label: 'Avsnitt 1',
            text: doc.prompts[0]!.text,
            focus: ['søkte', 'Kjetil', 'Kirkegata'],
            assetId: 'asset-1',
            seconds: 21,
          },
          {
            itemId: doc.prompts[1]!.id,
            label: 'Avsnitt 2',
            text: doc.prompts[1]!.text,
            focus: ['hvert', 'tjue'],
            assetId: 'asset-2',
            seconds: 12,
          },
        ],
        carriedItemIds: [],
      });
    });

    it('leaves a prompt carried from a returned try to the teacher’s ruling', async () => {
      const { handler } = readAloud({ carried: true });
      const subject = (await run(handler, 'voice_review')).value.subject;
      expect(subject).toMatchObject({ carriedItemIds: [sampleDocument().prompts[0]!.id] });
      expect(subject && 'prompts' in subject && subject.prompts.map((p) => p.assetId)).toEqual(['asset-2']);
    });

    it('reads AI as off for a mode the machine cannot check (Q7)', async () => {
      const { handler } = readAloud({ mode: 'dialogue' });
      expect((await run(handler, 'voice_review')).value.subject).toMatchObject({ ai: { on: false } });
    });

    it('is not handed to a text capability, which would read it as a template it does not know', async () => {
      const { handler, reads } = readAloud();
      expect((await run(handler, 'review_direct')).value).toMatchObject({ skip: 'TEMPLATE_NOT_SUPPORTED', subject: null });
      expect(reads).toEqual([]);
    });

    it('does not hand text to the voice check', async () => {
      const { handler, reads } = setup({ attempt: { status: 'ROUTED_FOR_REVIEW', schoolId: null, templateCode: 'translate_to_target' } });
      expect((await run(handler, 'voice_review')).value).toMatchObject({ skip: 'TEMPLATE_NOT_SUPPORTED', subject: null });
      expect(reads).toEqual([]);
    });
  });
});
