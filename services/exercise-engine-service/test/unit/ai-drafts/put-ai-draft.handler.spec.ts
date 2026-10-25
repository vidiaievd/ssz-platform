import { PutAiDraftHandler } from '../../../src/modules/ai-drafts/application/commands/put-ai-draft/put-ai-draft.handler.js';
import { PutAiDraftCommand } from '../../../src/modules/ai-drafts/application/commands/put-ai-draft/put-ai-draft.command.js';
import {
  AttemptAiDraft,
  type AiDraftStatus,
  type ProposedDraft,
} from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import type { IAttemptAiDraftRepository } from '../../../src/modules/ai-drafts/domain/repositories/attempt-ai-draft.repository.js';
import type { AttemptStatus } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import type { IAttemptRepository } from '../../../src/modules/attempts/domain/repositories/attempt.repository.js';

// Plan 79, step 1.2.

class MemoryDrafts implements IAttemptAiDraftRepository {
  readonly rows = new Map<string, AttemptAiDraft>();
  saves = 0;
  /** Makes the next save lose a race to this draft. */
  raceWith: AttemptAiDraft | null = null;

  async findByAiCallId(aiCallId: string) {
    return [...this.rows.values()].find((d) => d.aiCallId === aiCallId) ?? null;
  }
  async findByAttempt(attemptId: string, capability: string) {
    return [...this.rows.values()].find((d) => d.attemptId === attemptId && d.capability === capability) ?? null;
  }
  async listDecided() {
    return [];
  }
  async save(draft: AttemptAiDraft): Promise<'saved' | 'conflict'> {
    if (this.raceWith) {
      this.rows.set(this.raceWith.id, this.raceWith);
      this.raceWith = null;
      return 'conflict';
    }
    this.saves++;
    this.rows.set(draft.id, draft);
    return 'saved';
  }
}

const ATTEMPT = 'a0000000-0000-4000-8000-000000000001';

function setup(
  attempt: { status: AttemptStatus; schoolId: string | null; reviewAiPolicy?: unknown } | null = {
    status: 'ROUTED_FOR_REVIEW',
    schoolId: 'school-1',
  },
) {
  const drafts = new MemoryDrafts();
  const attempts = { findById: async (id: string) => (attempt && id === ATTEMPT ? { id, ...attempt } : null) } as unknown as IAttemptRepository;
  return { handler: new PutAiDraftHandler(attempts, drafts), drafts };
}

const draft = (over: Partial<ProposedDraft> = {}): ProposedDraft => ({
  status: 'READY',
  items: [{ itemId: 's1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Perfektum.', suggestion: 'har bodd' }],
  summary: null,
  marks: null,
  errorCode: null,
  providerId: 'p1',
  modelId: 'm1',
  promptVersion: 'review_draft@1',
  aiCallId: 'call-1',
  ...over,
});

const put = (handler: PutAiDraftHandler, over: Partial<ProposedDraft> = {}, attemptId = ATTEMPT) =>
  handler.execute(new PutAiDraftCommand(attemptId, 'review_draft', draft(over)));

function decide(drafts: MemoryDrafts, status: AiDraftStatus) {
  const [only] = [...drafts.rows.values()];
  drafts.rows.set(only!.id, AttemptAiDraft.restore(only!.id, {
    attemptId: only!.attemptId, capability: only!.capability, status, items: only!.items, summary: only!.summary,
    errorCode: only!.errorCode, providerId: only!.providerId, modelId: only!.modelId, promptVersion: only!.promptVersion,
    aiCallId: only!.aiCallId, createdAt: only!.createdAt, updatedAt: only!.updatedAt,
  }));
}

describe('PutAiDraftHandler', () => {
  it('stores a draft on a submission waiting for a teacher', async () => {
    const { handler, drafts } = setup();
    const result = await put(handler);
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ attemptId: ATTEMPT, capability: 'review_draft', status: 'READY', aiCallId: 'call-1' });
    expect(drafts.rows.size).toBe(1);
  });

  it('is idempotent on aiCallId: the second write changes nothing', async () => {
    const { handler, drafts } = setup();
    const first = await put(handler);
    const second = await put(handler, { summary: 'different text, same call' });
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.summary).toBeNull();
    expect(drafts.saves).toBe(1);
  });

  it('answers a replay even after the submission was decided', async () => {
    // A redelivered event after the verdict must not turn into an error loop.
    const attempt = { status: 'ROUTED_FOR_REVIEW' as AttemptStatus, schoolId: 'school-1' };
    const { handler } = setup(attempt);
    await put(handler);
    attempt.status = 'SCORED';
    expect((await put(handler)).isOk).toBe(true);
  });

  // Plan 79, step 1.7c.
  it('keeps suggested marks beside the remarks, and a rerun without them clears them', async () => {
    const { handler } = setup();
    const marks = [{ criterionId: 'c1', mark: 2 as const, reason: 'Noen feil.' }];
    expect((await put(handler, { marks })).value.marks).toEqual(marks);
    expect((await put(handler, { aiCallId: 'call-2', marks: null })).value.marks).toBeNull();
  });

  it('replaces a draft nobody acted on with a rerun', async () => {
    const { handler, drafts } = setup();
    const first = await put(handler, { status: 'FAILED', items: [], errorCode: 'invalid_response' });
    const rerun = await put(handler, { aiCallId: 'call-2' });
    expect(rerun.value.id).toBe(first.value.id);
    expect(rerun.value).toMatchObject({ status: 'READY', aiCallId: 'call-2', errorCode: null });
    expect(drafts.rows.size).toBe(1);
  });

  it.each(['SENT', 'EDITED', 'DISCARDED'] as const)('keeps a %s draft and refuses the rerun', async (status) => {
    const { handler, drafts } = setup();
    await put(handler);
    decide(drafts, status);
    const rerun = await put(handler, { aiCallId: 'call-2' });
    expect(rerun.isFail).toBe(true);
    expect(rerun.error).toEqual({ code: 'DRAFT_DECIDED' });
    expect([...drafts.rows.values()][0]!.aiCallId).toBe('call-1');
  });

  it('is not found for an unknown attempt', async () => {
    const { handler } = setup(null);
    expect((await put(handler)).error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it.each(['SCORED', 'RETURNED', 'IN_PROGRESS', 'ABANDONED'] as const)('refuses a %s submission', async (status) => {
    const { handler, drafts } = setup({ status, schoolId: 'school-1' });
    expect((await put(handler)).error).toEqual({ code: 'ATTEMPT_NOT_IN_REVIEW' });
    expect(drafts.rows.size).toBe(0);
  });

  it("refuses a teacher's draft on work no teacher reviews", async () => {
    const { handler } = setup({ status: 'ROUTED_FOR_REVIEW', schoolId: null });
    expect((await put(handler)).error).toEqual({ code: 'NO_TEACHER_REVIEW' });
  });

  // Plan 80: the learner's review is the teacher's draft there.
  it("refuses a teacher's draft on work the school has a model answer first", async () => {
    const { handler } = setup({
      status: 'ROUTED_FOR_REVIEW',
      schoolId: 'school-1',
      reviewAiPolicy: { mode: 'ai_then_teacher', autoAcceptAt: null, teacherDrawn: false },
    });
    expect((await put(handler)).error).toEqual({ code: 'AI_REVIEWS_FIRST' });
  });

  it('refuses an aiCallId that already holds another submission’s draft', async () => {
    const { handler, drafts } = setup();
    await put(handler);
    const [stored] = [...drafts.rows.values()];
    drafts.rows.set(stored!.id, AttemptAiDraft.restore(stored!.id, { ...propsOf(stored!), attemptId: 'other' }));
    expect((await put(handler)).error).toEqual({ code: 'AI_CALL_ID_REUSED' });
  });

  it('answers from the twin that won a race on the same call', async () => {
    const { handler, drafts } = setup();
    const twin = AttemptAiDraft.propose(ATTEMPT, 'review_draft', draft(), new Date());
    drafts.raceWith = twin;
    const result = await put(handler);
    expect(result.isOk).toBe(true);
    expect(result.value.id).toBe(twin.id);
  });
});

function propsOf(d: AttemptAiDraft) {
  return {
    attemptId: d.attemptId, capability: d.capability, status: d.status, items: d.items, summary: d.summary,
    errorCode: d.errorCode, providerId: d.providerId, modelId: d.modelId, promptVersion: d.promptVersion,
    aiCallId: d.aiCallId, createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}
