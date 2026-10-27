import {
  SAMPLE_PROMPT_IDS,
  sampleDocument,
  toContent,
  toExpectedAnswers,
  type ReadAloudContent,
} from '@ssz/shared-kernel/read-aloud';
import { ListReadingCasesHandler } from '../../../src/modules/ai-drafts/application/queries/list-reading-cases/list-reading-cases.handler.js';
import { ListReadingCasesQuery } from '../../../src/modules/ai-drafts/application/queries/list-reading-cases/list-reading-cases.query.js';
import type { IAttemptRepository } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';
import {
  ContentClientError,
  type IContentClient,
} from '../../../src/shared/application/ports/content-client.port.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 82, step 10: the readings teachers ruled on, as the set a speech model is measured against.

const [P1, P2] = SAMPLE_PROMPT_IDS;
const REVIEWED_AT = new Date('2026-10-26T09:00:00Z');

interface AttemptRow {
  id: string;
  exerciseId: string;
  targetLanguage: string;
  templateCode: string;
  submittedAnswer: unknown;
  reviewedAt: Date | null;
  reviewDecisions: Array<{ itemId: string; approved: boolean; comment?: string }> | null;
}

function attempt(id: string, overrides: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id,
    exerciseId: 'ex-1',
    targetLanguage: 'nb',
    templateCode: 'read_aloud',
    submittedAnswer: {
      recordings: [
        { itemId: P1, assetId: 'asset-1', seconds: 22, takes: 2 },
        { itemId: P2, assetId: 'asset-2', seconds: 14, takes: 1 },
      ],
    },
    reviewedAt: REVIEWED_AT,
    reviewDecisions: [
      { itemId: P1, approved: true, comment: 'Fint.' },
      { itemId: P2, approved: false, comment: 'Hør på «tjue».' },
    ],
    ...overrides,
  };
}

function setup(rows: AttemptRow[], opts: { doc?: ReadAloudContent; content?: 'ok' | 404 | 503 } = {}) {
  const doc = opts.doc ?? sampleDocument();
  const listed: Array<[string, number]> = [];
  const attempts = {
    findTeacherReviewed: async (templateCode: string, limit: number) => {
      listed.push([templateCode, limit]);
      return rows;
    },
  } as unknown as IAttemptRepository;
  const reads: string[] = [];
  const contentClient = {
    getExerciseForAttempt: async (id: string, lang: string) => {
      reads.push(`${id}:${lang}`);
      const content = opts.content ?? 'ok';
      if (content !== 'ok') return Result.fail(new ContentClientError(content, 'nope'));
      return Result.ok({ exercise: { content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) } });
    },
  } as unknown as IContentClient;
  return { handler: new ListReadingCasesHandler(attempts, contentClient), listed, reads };
}

describe('ListReadingCasesHandler', () => {
  it('hands out each prompt a teacher ruled on beside its passage and take, without people', async () => {
    const { handler, listed } = setup([attempt('a1')]);
    const result = await handler.execute(new ListReadingCasesQuery(40));

    expect(listed).toEqual([['read_aloud', 40]]);
    expect(result.value).toEqual({
      cases: [
        {
          caseId: 'a1',
          decidedAt: REVIEWED_AT.toISOString(),
          targetLanguage: 'nb',
          passPercent: 85,
          prompts: [
            { itemId: P1, text: sampleDocument().prompts[0]!.text, assetId: 'asset-1', seconds: 22, approved: true },
            { itemId: P2, text: sampleDocument().prompts[1]!.text, assetId: 'asset-2', seconds: 14, approved: false },
          ],
        },
      ],
      skipped: {},
    });
    // None of the teacher's words.
    expect(JSON.stringify(result.value)).not.toContain('tjue».');
  });

  it("takes the exercise's mark as it is today, whatever the author's AI switch", async () => {
    const doc = sampleDocument();
    doc.review.aiStage = false;
    doc.review.readingPassPercent = 90;
    const { handler } = setup([attempt('a1')], { doc });

    const result = await handler.execute(new ListReadingCasesQuery(10));
    expect(result.value.cases[0]).toMatchObject({ passPercent: 90 });
  });

  it('leaves out carried and undecided prompts, and a reading with none left', async () => {
    const carried = { attemptId: 'a0', attempt: 1, marks: {}, points: 6, max: 6, comment: 'OK' };
    const { handler } = setup([
      attempt('partly', { reviewDecisions: [{ itemId: P2, approved: false }] }),
      attempt('carried', {
        submittedAnswer: {
          recordings: [
            { itemId: P1, assetId: 'asset-1', seconds: 22, takes: 1, carried },
            { itemId: P2, assetId: 'asset-2', seconds: 14, takes: 1 },
          ],
        },
        reviewDecisions: [{ itemId: P1, approved: true }],
      }),
    ]);

    const result = await handler.execute(new ListReadingCasesQuery(10));
    expect(result.value.cases.map((c) => [c.caseId, c.prompts.map((p) => p.itemId)])).toEqual([['partly', [P2]]]);
    expect(result.value.skipped).toEqual({ NO_PROMPTS: 1 });
  });

  it('counts the readings it cannot use, by reason', async () => {
    const { handler } = setup([attempt('none', { reviewDecisions: [] }), attempt('empty', { reviewDecisions: null })]);
    expect((await handler.execute(new ListReadingCasesQuery(10))).value.skipped).toEqual({ NO_DECISIONS: 2 });

    const monologue = sampleDocument();
    monologue.mode = 'monologue';
    const spoken = setup([attempt('m1')], { doc: monologue });
    expect((await spoken.handler.execute(new ListReadingCasesQuery(10))).value).toEqual({
      cases: [],
      skipped: { NOT_READ_MODE: 1 },
    });

    const gone = setup([attempt('g1'), attempt('g2')], { content: 404 });
    expect((await gone.handler.execute(new ListReadingCasesQuery(10))).value.skipped).toEqual({ EXERCISE_GONE: 2 });
  });

  it('reads an exercise once for all its readings, and fails whole when content cannot answer', async () => {
    const { handler, reads } = setup([attempt('a1'), attempt('a2'), attempt('a3', { exerciseId: 'ex-2' })]);
    await handler.execute(new ListReadingCasesQuery(10));
    expect(reads).toEqual(['ex-1:nb', 'ex-2:nb']);

    const down = setup([attempt('a1')], { content: 503 });
    const result = await down.handler.execute(new ListReadingCasesQuery(10));
    expect(result.isFail && result.error).toEqual({ code: 'CONTENT_UNAVAILABLE' });
  });
});
