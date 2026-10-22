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
  attempt?: { status: AttemptStatus; schoolId: string | null; templateCode: string } | null;
  draft?: boolean;
  content?: 'ok' | 404 | 503;
  submitted?: unknown;
}

function setup({ attempt, draft = false, content = 'ok', submitted }: Setup = {}) {
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
          ...attempt,
        };
  const attempts = { findById: async () => row } as unknown as IAttemptRepository;
  const drafts = { findByAttempt: async () => (draft ? { id: 'd1' } : null) } as unknown as IAttemptAiDraftRepository;
  const reads: string[] = [];
  const contentClient = {
    getExerciseForAttempt: async (id: string, lang: string, mode: string) => {
      reads.push(`${id}:${lang}:${mode}`);
      if (content !== 'ok') return Result.fail(new ContentClientError(content, 'nope'));
      return Result.ok({ exercise: { content: CONTENT, expectedAnswers: ANSWERS } });
    },
  } as unknown as IContentClient;
  return { handler: new GetReviewSubjectHandler(attempts, drafts, contentClient), reads };
}

const run = (handler: GetReviewSubjectHandler) => handler.execute(new GetReviewSubjectQuery(ATTEMPT, 'review_draft'));

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

  it.each([
    [{ status: 'SCORED' as AttemptStatus, schoolId: 'school-1', templateCode: 'translate_to_target' }, 'ATTEMPT_NOT_IN_REVIEW'],
    [{ status: 'ROUTED_FOR_REVIEW' as AttemptStatus, schoolId: null, templateCode: 'translate_to_target' }, 'NO_TEACHER_REVIEW'],
    [{ status: 'ROUTED_FOR_REVIEW' as AttemptStatus, schoolId: 'school-1', templateCode: 'writing_task' }, 'TEMPLATE_NOT_SUPPORTED'],
  ])('skips %o as %s without reading content', async (attempt, reason) => {
    const { handler, reads } = setup({ attempt });
    const result = await run(handler);
    expect(result.value).toMatchObject({ skip: reason, subject: null });
    expect(reads).toEqual([]);
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
});
