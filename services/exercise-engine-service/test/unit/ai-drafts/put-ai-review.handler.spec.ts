import { jest } from '@jest/globals';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import { PutAiReviewHandler } from '../../../src/modules/ai-drafts/application/commands/put-ai-review/put-ai-review.handler.js';
import { PutAiReviewCommand } from '../../../src/modules/ai-drafts/application/commands/put-ai-review/put-ai-review.command.js';
import { decisionsUnderMachine } from '../../../src/modules/ai-drafts/domain/ai-verdict.js';
import type { AiVerdict } from '../../../src/modules/ai-drafts/domain/ai-verdict.js';
import {
  AttemptAiDraft,
  type ProposedDraft,
} from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import type { IAttemptAiDraftRepository } from '../../../src/modules/ai-drafts/domain/repositories/attempt-ai-draft.repository.js';
import { ReviewScoring } from '../../../src/modules/attempts/application/services/review-scoring.js';
import { Attempt, type AttemptReviewAiPolicy } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 79, step 2.1b.

class MemoryDrafts implements IAttemptAiDraftRepository {
  readonly rows = new Map<string, AttemptAiDraft>();
  saves = 0;

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
    this.saves++;
    this.rows.set(draft.id, draft);
    return 'saved';
  }
}

/** The first sentence hit the key; the other two are why the work is waiting. */
const DETAILS = {
  totalItems: 3,
  items: [
    { itemId: 'i1', routing: 'pass', verdict: 'exact' },
    { itemId: 'i2', routing: 'teacher', verdict: 'near' },
    { itemId: 'i3', routing: 'teacher', verdict: 'off' },
  ],
};

/** Four criteria weighted 2/1/1/1 — 15 points in all, a pass at 8. */
const RUBRIC: RubricSnapshot = {
  criteria: [
    { id: 'task', name: 'Oppgaveløsning', desc: '', weight: 2, levels: ['', '', '', ''] },
    { id: 'struct', name: 'Struktur', desc: '', weight: 1, levels: ['', '', '', ''] },
    { id: 'lang', name: 'Språk', desc: '', weight: 1, levels: ['', '', '', ''] },
    { id: 'lexis', name: 'Ordforråd', desc: '', weight: 1, levels: ['', '', '', ''] },
  ],
  passScore: 8,
};

function routed(
  templateCode = 'translate_to_target',
  schoolId: string | null = null,
  policy: AttemptReviewAiPolicy | null = null,
): Attempt {
  const attempt = Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode,
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    axes: { skills: [], focus: [] },
  });
  attempt.snapshotReviewContext({
    schoolId,
    containerId: null,
    groupId: null,
    exercisePath: null,
    previousAttemptId: null,
    revisionCount: 0,
  });
  if (templateCode === 'writing_task') {
    attempt.submit({ text: 'Hei! Jeg skriver til deg om leiligheten.', ticked: [] }, 'hash');
    attempt.routeForReview({ autoPassedItems: 0, totalItems: 1 }, RUBRIC);
  } else {
    attempt.submit([{ itemId: 'i1', text: 'Jeg har bodd i Tromsø i tre år.' }], 'hash');
    attempt.routeForReview(undefined, null, policy);
  }
  attempt.clearDomainEvents();
  return attempt;
}

function setup(attempt: Attempt | null, details: unknown = DETAILS) {
  const drafts = new MemoryDrafts();
  const attempts = {
    findById: jest.fn(() => Promise.resolve(attempt)),
    save: jest.fn(() => Promise.resolve()),
  };
  const validator = {
    validate: jest.fn(() => Promise.resolve(Result.ok({ correct: false, score: 0, details, requiresReview: true }))),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() =>
      Promise.resolve(
        Result.ok({
          exercise: { content: {}, expectedAnswers: {}, answerCheckSettings: null },
          template: { answerSchema: {}, defaultCheckSettings: {} },
        }),
      ),
    ),
  };
  const publisher = { publish: jest.fn((_type: string, _payload: unknown) => Promise.resolve()) };
  const handler = new PutAiReviewHandler(
    attempts as never,
    drafts,
    new ReviewScoring(validator as never, contentClient as never),
    publisher as never,
  );
  return { handler, drafts, attempts, publisher };
}

const draft = (over: Partial<ProposedDraft> = {}): ProposedDraft => ({
  status: 'READY',
  items: [{ itemId: 'i3', sentenceIndex: 3, aspect: 'grammar', fragment: 'bor', comment: 'Perfektum.', suggestion: 'har bodd' }],
  summary: 'To av tre setninger er riktige.',
  marks: null,
  errorCode: null,
  providerId: 'p1',
  modelId: 'm1',
  promptVersion: 'review_direct@1',
  aiCallId: 'call-1',
  ...over,
});

const verdict = (over: Partial<AiVerdict> = {}): AiVerdict => ({
  outcome: 'approved',
  decisions: [
    { itemId: 'i2', approved: true },
    { itemId: 'i3', approved: false },
  ],
  ...over,
});

const put = (
  handler: PutAiReviewHandler,
  attempt: Attempt,
  over: Partial<ProposedDraft> = {},
  v: AiVerdict | null = verdict(),
) => handler.execute(new PutAiReviewCommand(attempt.id, draft(over), v));

const published = (publisher: { publish: jest.Mock }) =>
  publisher.publish.mock.calls.map(([type, payload]) => ({ type, payload: payload as Record<string, unknown> }));

describe('decisionsUnderMachine (Q4-C)', () => {
  const auto = [
    { itemId: 'i1', autoPassed: true },
    { itemId: 'i2', autoPassed: false },
  ];

  it('lets the machine decide what it closed and the model the rest', () => {
    const result = decisionsUnderMachine(auto, [
      { itemId: 'i1', approved: false },
      { itemId: 'i2', approved: false },
      { itemId: 'stray', approved: true },
    ]);
    expect(result).toEqual({
      decisions: [
        { itemId: 'i1', approved: true },
        { itemId: 'i2', approved: false },
      ],
      missing: [],
    });
  });

  it('names an open item the model said nothing about', () => {
    expect(decisionsUnderMachine(auto, []).missing).toEqual(['i2']);
  });

  it('takes the model at its word when there are no items to go by', () => {
    expect(decisionsUnderMachine([], [{ itemId: 'x', approved: true }])).toEqual({
      decisions: [{ itemId: 'x', approved: true }],
      missing: [],
    });
  });
});

describe('PutAiReviewHandler', () => {
  it('stores the review and closes the attempt as a model-approved one', async () => {
    const attempt = routed();
    const { handler, drafts, attempts, publisher } = setup(attempt);

    const result = await put(handler, attempt, {}, verdict({ decisions: [{ itemId: 'i1', approved: false }, ...verdict().decisions] }));

    expect(result.isOk).toBe(true);
    // i1 is the machine's however the model ruled it, i2 approved, i3 not: two of three.
    expect(result.value.attempt).toEqual({ status: 'SCORED', score: 67, passed: true, provisional: false });
    expect(attempt.reviewedByUserId).toBeNull();
    expect(attempt.deliveredVerdict()).toBeNull();
    expect(attempt.reviewComment).toBe('To av tre setninger er riktige.');
    expect(attempts.save).toHaveBeenCalledTimes(1);
    expect([...drafts.rows.values()]).toEqual([
      expect.objectContaining({ capability: 'review_direct', status: 'READY', aiCallId: 'call-1' }),
    ]);

    // No letter from a teacher — none answered.
    const events = published(publisher);
    expect(events.map((e) => e.type)).toEqual(['exercise.attempt.completed', 'exercise.attempt.ai_reviewed']);
    expect(events[0]!.payload).toMatchObject({ completed: true, score: 67, reviewOutcome: 'approved', reviewedBy: 'ai' });
    // What a dispute rate is read against (2.3b), on the review's axes.
    expect(events[1]!.payload).toMatchObject({
      attemptId: attempt.id,
      capability: 'review_direct',
      outcome: 'approved',
      templateCode: attempt.templateCode,
    });
    // Closed at once, not by a school's term — no journal row for it.
    expect(events[1]!.payload).not.toHaveProperty('acceptedAtTerm');
  });

  it('sends the work back with its summary, marked as a model\'s return', async () => {
    const attempt = routed();
    const { handler, publisher } = setup(attempt);

    const result = await put(handler, attempt, {}, verdict({ outcome: 'returned' }));

    expect(result.value.attempt.status).toBe('RETURNED');
    const [event] = published(publisher);
    expect(event!.payload).toMatchObject({ reviewOutcome: 'returned', reviewedBy: 'ai', score: 67, completed: false });
  });

  it('refuses a return with nothing said, and stores nothing', async () => {
    const attempt = routed();
    const { handler, drafts, publisher } = setup(attempt);

    const result = await put(handler, attempt, { summary: '  ' }, verdict({ outcome: 'returned' }));

    expect(result.error).toEqual({ code: 'RETURN_REQUIRES_COMMENT' });
    expect(drafts.saves).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('refuses a verdict that leaves an open item unruled', async () => {
    const attempt = routed();
    const { handler, drafts } = setup(attempt);

    const result = await put(handler, attempt, {}, verdict({ decisions: [{ itemId: 'i2', approved: true }] }));

    expect(result.error).toEqual({ code: 'VERDICT_INCOMPLETE', missing: ['i3'] });
    expect(drafts.saves).toBe(0);
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
  });

  it('refuses a ready review without its verdict', async () => {
    const attempt = routed();
    expect((await put(setup(attempt).handler, attempt, {}, null)).error).toEqual({ code: 'VERDICT_MISSING' });
  });

  it('refuses work a teacher reviews', async () => {
    const attempt = routed('translate_to_target', 'school-1');
    const { handler, drafts } = setup(attempt);
    expect((await put(handler, attempt)).error).toEqual({ code: 'HAS_TEACHER_REVIEW' });
    expect(drafts.saves).toBe(0);
  });

  it('refuses a template with no review prompt', async () => {
    const attempt = routed('dictation');
    expect((await put(setup(attempt).handler, attempt)).error).toEqual({ code: 'TEMPLATE_NOT_SUPPORTED' });
  });

  it('records a failed call and leaves the work waiting', async () => {
    const attempt = routed();
    const { handler, drafts, publisher } = setup(attempt);

    const result = await put(handler, attempt, { status: 'FAILED', items: [], summary: null, errorCode: 'invalid_response' }, null);

    expect(result.value.attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect([...drafts.rows.values()][0]!.status).toBe('FAILED');
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('answers the same call again with what it did, and closes nothing twice', async () => {
    const attempt = routed();
    const { handler, drafts, attempts, publisher } = setup(attempt);

    await put(handler, attempt);
    const again = await put(handler, attempt);

    expect(again.isOk).toBe(true);
    expect(again.value.attempt.status).toBe('SCORED');
    expect(drafts.saves).toBe(1);
    expect(attempts.save).toHaveBeenCalledTimes(1);
    expect(published(publisher).map((e) => e.type)).toEqual([
      'exercise.attempt.completed',
      'exercise.attempt.ai_reviewed',
    ]);
  });

  it('finishes a write cut off after the review was saved', async () => {
    const attempt = routed();
    const { handler, drafts, publisher } = setup(attempt);
    const saved = AttemptAiDraft.propose(attempt.id, 'review_direct', draft(), new Date());
    drafts.rows.set(saved.id, saved);

    const result = await put(handler, attempt);

    expect(result.value.attempt.status).toBe('SCORED');
    expect(drafts.saves).toBe(0);
    expect(published(publisher).map((e) => e.type)).toEqual([
      'exercise.attempt.completed',
      'exercise.attempt.ai_reviewed',
    ]);
  });

  it('refuses a call id that holds a teacher\'s draft', async () => {
    const attempt = routed();
    const { handler, drafts } = setup(attempt);
    const teachers = AttemptAiDraft.propose(attempt.id, 'review_draft', draft(), new Date());
    drafts.rows.set(teachers.id, teachers);

    expect((await put(handler, attempt)).error).toEqual({ code: 'AI_CALL_ID_REUSED' });
  });

  it('rules an essay by the model\'s marks against the frozen rubric, whatever outcome it sent', async () => {
    const attempt = routed('writing_task');
    const { handler, publisher } = setup(attempt, {});
    const marks: ProposedDraft['marks'] = [
      { criterionId: 'task', mark: 2, reason: '.' },
      { criterionId: 'struct', mark: 2, reason: '.' },
      { criterionId: 'lang', mark: 1, reason: '.' },
      { criterionId: 'lexis', mark: 1, reason: '.' },
    ];

    const result = await put(handler, attempt, { items: [], marks }, verdict({ outcome: 'returned', decisions: [] }));

    // 2×2 + 2 + 1 + 1 = 8 of 15: a pass at 8.
    expect(result.value.attempt).toEqual({ status: 'SCORED', score: 53, passed: true, provisional: false });
    expect(attempt.rubricMarks).toEqual({ task: 2, struct: 2, lang: 1, lexis: 1 });
    expect(published(publisher)[0]!.payload).toMatchObject({ reviewedBy: 'ai', passed: true });
  });

  it('refuses an essay verdict with a criterion unmarked', async () => {
    const attempt = routed('writing_task');
    const { handler } = setup(attempt, {});
    const result = await put(handler, attempt, { items: [], marks: [{ criterionId: 'task', mark: 3, reason: '.' }] });
    expect(result.error).toEqual({ code: 'VERDICT_INCOMPLETE', missing: ['struct', 'lang', 'lexis'] });
  });
});

// Plan 80, step 3b — a school that has a model answer first.
describe('PutAiReviewHandler on a school’s work', () => {
  const AUTO_ACCEPT_AT = new Date('2026-11-01T09:00:00Z');
  const policy = (mode: AttemptReviewAiPolicy['mode'], teacherDrawn = false): AttemptReviewAiPolicy => ({
    mode,
    autoAcceptAt: AUTO_ACCEPT_AT,
    teacherDrawn,
  });

  it('keeps the verdict provisional: stored, saved, and nothing published', async () => {
    const attempt = routed('translate_to_target', 'school-1', policy('ai_then_teacher'));
    const { handler, drafts, attempts, publisher } = setup(attempt);

    const result = await put(handler, attempt);

    expect(result.isOk).toBe(true);
    expect(result.value.attempt).toEqual({ status: 'ROUTED_FOR_REVIEW', score: null, passed: null, provisional: true });
    expect(attempt.provisionalAiVerdict).toMatchObject({
      outcome: 'approved',
      score: 67,
      approvedItems: 2,
      totalItems: 3,
      // Step 6c: kept for the teacher's letter to be folded on.
      model: { capability: 'review_direct', modelId: 'm1', promptVersion: 'review_direct@1' },
    });
    expect(attempts.save).toHaveBeenCalledTimes(1);
    expect([...drafts.rows.values()]).toEqual([expect.objectContaining({ capability: 'review_direct', status: 'READY' })]);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('answers a replay of the same call from what is there', async () => {
    const attempt = routed('translate_to_target', 'school-1', policy('ai_then_teacher'));
    const { handler, attempts } = setup(attempt);
    await put(handler, attempt);

    const again = await put(handler, attempt);

    expect(again.isOk).toBe(true);
    expect(again.value.attempt.provisional).toBe(true);
    expect(attempts.save).toHaveBeenCalledTimes(1);
  });

  it('refuses a second call: the learner has read the first', async () => {
    const attempt = routed('translate_to_target', 'school-1', policy('ai_then_teacher'));
    const { handler } = setup(attempt);
    await put(handler, attempt);

    const other = await put(handler, attempt, { aiCallId: 'call-2' }, verdict({ outcome: 'returned' }));

    expect(other.error).toEqual({ code: 'DRAFT_DECIDED' });
    expect(attempt.provisionalAiVerdict?.outcome).toBe('approved');
  });

  it('closes sampled-out work the model credits, as for a learner nobody reviews', async () => {
    const attempt = routed('translate_to_target', 'school-1', policy('ai_with_sampling'));
    const { handler, publisher } = setup(attempt);

    const result = await put(handler, attempt);

    expect(result.value.attempt).toEqual({ status: 'SCORED', score: 67, passed: true, provisional: false });
    expect(published(publisher).map((e) => e.type)).toEqual(
      expect.arrayContaining(['exercise.attempt.ai_reviewed']),
    );
  });

  it('sends sampled-out work to the teacher when the model rules against the auto-check', async () => {
    const attempt = routed('translate_to_target', 'school-1', policy('ai_with_sampling'));
    const { handler, publisher } = setup(attempt);

    // i1 hit the key; the model says it is wrong.
    const result = await put(handler, attempt, {}, verdict({ decisions: [{ itemId: 'i1', approved: false }, ...verdict().decisions] }));

    expect(result.value.attempt.provisional).toBe(true);
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('refuses a school’s work without a policy, as before', async () => {
    const attempt = routed('translate_to_target', 'school-1');
    const { handler } = setup(attempt);
    expect((await put(handler, attempt)).error).toEqual({ code: 'HAS_TEACHER_REVIEW' });
  });
});

describe('Attempt.reviewByAi', () => {
  it('does not take a model\'s verdict on a school\'s work', () => {
    const attempt = routed('translate_to_target', 'school-1');
    const result = attempt.reviewByAi({ outcome: 'approved', decisions: [], comment: null, score: 100 });
    expect(result.isFail).toBe(true);
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
  });
});
