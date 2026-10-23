import { ListReviewCasesHandler } from '../../../src/modules/ai-drafts/application/queries/list-review-cases/list-review-cases.handler.js';
import { ListReviewCasesQuery } from '../../../src/modules/ai-drafts/application/queries/list-review-cases/list-review-cases.query.js';
import { AttemptAiDraft, type AiDraftRemark } from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import type { IAttemptAiDraftRepository } from '../../../src/modules/ai-drafts/domain/repositories/attempt-ai-draft.repository.js';
import type { IAttemptRepository } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  ContentClientError,
  type IContentClient,
} from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 79, step 1.6.

const CONTENT = {
  dir: 'to_target',
  langs: { explain: 'Russisk', target: 'Norsk' },
  format: 'set',
  items: [
    { id: 's1', source: 'Я живу здесь три года.', gloss: [] },
    { id: 's2', source: 'Она читает книгу.', gloss: [] },
  ],
  ai: { on: true, checks: { grammar: true, order: true, lexis: true, register: false }, visibility: 'teacher' },
};
const ANSWERS = { items: { s1: { refs: ['Jeg har bodd her i tre år'] }, s2: { refs: ['Hun leser en bok'] } } };

const NOW = new Date('2026-10-22T10:00:00Z');

const REMARKS: AiDraftRemark[] = [
  { itemId: 's1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Нужен perfektum.', suggestion: 'har bodd' },
  { itemId: 's2', sentenceIndex: 2, aspect: 'lexis', fragment: 'boka', comment: 'Неопределённая форма.', suggestion: null },
];

function draft(attemptId: string, decided = true, items: AiDraftRemark[] = REMARKS): AttemptAiDraft {
  return AttemptAiDraft.restore(`d-${attemptId}`, {
    attemptId,
    capability: 'review_draft',
    status: decided ? 'EDITED' : 'READY',
    items,
    summary: 'Хорошо.',
    errorCode: null,
    providerId: 'p1',
    modelId: 'm1',
    promptVersion: 'review_draft@1',
    aiCallId: `call-${attemptId}`,
    outcomes: decided ? { remarks: ['edited', 'discarded'], summary: 'untouched', draftDiscarded: false } : null,
    decidedAt: decided ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

interface AttemptRow {
  id: string;
  userId: string;
  schoolId: string;
  exerciseId: string;
  targetLanguage: string;
  templateCode: string;
  submittedAnswer: unknown;
  reviewDecisions: Array<{ itemId: string; approved: boolean; comment?: string }> | null;
}

function attempt(id: string, overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id,
    userId: 'learner-1',
    schoolId: 'school-1',
    exerciseId: 'ex-1',
    targetLanguage: 'nb',
    templateCode: 'translate_to_target',
    submittedAnswer: { answers: [{ itemId: 's1', text: 'Jeg bor her i tre år' }, { itemId: 's2', text: 'Hun leser boka' }] },
    reviewDecisions: [
      { itemId: 's1', approved: false, comment: 'Перфект!' },
      { itemId: 's2', approved: true },
    ],
    ...overrides,
  };
}

function setup(drafts: AttemptAiDraft[], rows: AttemptRow[], content: 'ok' | 404 | 503 = 'ok') {
  const listed: Array<[string, number]> = [];
  const repo = {
    listDecided: async (capability: string, limit: number) => {
      listed.push([capability, limit]);
      return drafts;
    },
  } as unknown as IAttemptAiDraftRepository;
  const attempts = { findById: async (id: string) => rows.find((r) => r.id === id) ?? null } as unknown as IAttemptRepository;
  const reads: string[] = [];
  const contentClient = {
    getExerciseForAttempt: async (id: string, lang: string) => {
      reads.push(`${id}:${lang}`);
      if (content !== 'ok') return Result.fail(new ContentClientError(content, 'nope'));
      return Result.ok({ exercise: { content: CONTENT, expectedAnswers: ANSWERS } });
    },
  } as unknown as IContentClient;
  return { handler: new ListReviewCasesHandler(repo, attempts, contentClient), listed, reads };
}

describe('ListReviewCasesHandler', () => {
  it('hands out each settled draft beside its key, without people', async () => {
    const { handler, listed } = setup([draft('a1')], [attempt('a1')]);
    const result = await handler.execute(new ListReviewCasesQuery('review_draft', 50));

    expect(listed).toEqual([['review_draft', 50]]);
    expect(result.value.skipped).toEqual({});
    const [one] = result.value.cases;
    expect(one).toEqual({
      caseId: 'a1',
      decidedAt: NOW.toISOString(),
      templateCode: 'translate_to_target',
      subject: expect.objectContaining({
        template: 'translate',
        sentences: [
          expect.objectContaining({ itemId: 's1', answer: 'Jeg bor her i tre år', refs: ['Jeg har bodd her i tre år'] }),
          expect.objectContaining({ itemId: 's2', answer: 'Hun leser boka' }),
        ],
      }),
      offered: {
        modelId: 'm1',
        promptVersion: 'review_draft@1',
        remarks: [
          { sentenceIndex: 1, itemId: 's1', aspect: 'grammar', fragment: 'bor' },
          { sentenceIndex: 2, itemId: 's2', aspect: 'lexis', fragment: 'boka' },
        ],
      },
      outcomes: { remarks: ['edited', 'discarded'], summary: 'untouched', draftDiscarded: false },
      decisions: [
        { itemId: 's1', approved: false },
        { itemId: 's2', approved: true },
      ],
    });
    const text = JSON.stringify(one);
    expect(text).not.toContain('learner-1');
    expect(text).not.toContain('school-1');
    expect(text).not.toContain('Перфект!');
    expect(text).not.toContain('Нужен perfektum.');
  });

  it('reads an exercise once for every case of it', async () => {
    const { handler, reads } = setup([draft('a1'), draft('a2')], [attempt('a1'), attempt('a2')]);
    const result = await handler.execute(new ListReviewCasesQuery('review_draft', 50));

    expect(result.value.cases).toHaveLength(2);
    expect(reads).toEqual(['ex-1:nb']);
  });

  it('counts what it leaves out, by reason', async () => {
    const { handler } = setup(
      [draft('gone'), draft('silent'), draft('other'), draft('ok')],
      [
        attempt('silent', { reviewDecisions: [] }),
        attempt('other', { templateCode: 'short_answer' }),
        attempt('ok'),
      ],
    );
    const result = await handler.execute(new ListReviewCasesQuery('review_draft', 50));

    expect(result.value.cases.map((c) => c.caseId)).toEqual(['ok']);
    expect(result.value.skipped).toEqual({ ATTEMPT_GONE: 1, NO_DECISIONS: 1, TEMPLATE_NOT_SUPPORTED: 1 });
  });

  // Plan 79, step 1.7b: an essay is marked by rubric, so its verdict has no decisions.
  it('keeps a rubric-marked essay without per-item decisions, remarks on the whole text included', async () => {
    const essay = draft('w1', true, [
      { itemId: 'text', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: '…', suggestion: null },
      { itemId: 'text', sentenceIndex: 1, aspect: 'task', fragment: null, comment: '…', suggestion: null },
    ]);
    const { handler } = setup(
      [essay],
      [attempt('w1', { templateCode: 'writing_task', submittedAnswer: { text: 'Jeg bor her.' }, reviewDecisions: [] })],
    );
    const result = await handler.execute(new ListReviewCasesQuery('review_draft', 50));

    expect(result.value.skipped).toEqual({});
    const [one] = result.value.cases;
    expect(one).toMatchObject({
      caseId: 'w1',
      templateCode: 'writing_task',
      subject: { template: 'writing_task', text: 'Jeg bor her.' },
      offered: {
        remarks: [
          { sentenceIndex: 1, itemId: 'text', aspect: 'grammar', fragment: 'bor' },
          { sentenceIndex: 1, itemId: 'text', aspect: 'task', fragment: null },
        ],
      },
      decisions: [],
    });
  });

  it('drops a case whose exercise was deleted', async () => {
    const { handler } = setup([draft('a1')], [attempt('a1')], 404);
    const result = await handler.execute(new ListReviewCasesQuery('review_draft', 50));

    expect(result.value).toEqual({ cases: [], skipped: { EXERCISE_GONE: 1 } });
  });

  it('fails rather than hand out a set with holes when content-service is down', async () => {
    const { handler } = setup([draft('a1')], [attempt('a1')], 503);
    const result = await handler.execute(new ListReviewCasesQuery('review_draft', 50));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'CONTENT_UNAVAILABLE' });
  });
});
