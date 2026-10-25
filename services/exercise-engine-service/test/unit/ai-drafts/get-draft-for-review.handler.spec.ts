import { jest } from '@jest/globals';
import { GetDraftForReviewHandler } from '../../../src/modules/ai-drafts/application/queries/get-draft-for-review/get-draft-for-review.handler.js';
import { GetDraftForReviewQuery } from '../../../src/modules/ai-drafts/application/queries/get-draft-for-review/get-draft-for-review.query.js';
import {
  AttemptAiDraft,
  type AiDraftStatus,
} from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';

const CREATED = new Date('2026-10-22T10:00:00Z');

function draft(status: AiDraftStatus): AttemptAiDraft {
  return AttemptAiDraft.restore('d1', {
    attemptId: 'a1',
    capability: 'review_draft',
    status,
    items:
      status === 'FAILED'
        ? []
        : [
            {
              itemId: 'i1',
              sentenceIndex: 1,
              aspect: 'order',
              fragment: 'i går jeg var',
              comment: 'V2: verbet står på andre plass.',
              suggestion: 'i går var jeg',
            },
          ],
    summary: status === 'FAILED' ? null : 'Ordstilling i leddsetninger.',
    errorCode: status === 'FAILED' ? 'invalid_response' : null,
    providerId: 'fake',
    modelId: 'fake-model',
    promptVersion: 'review_draft@1',
    aiCallId: 'call-1',
    createdAt: CREATED,
    updatedAt: CREATED,
  });
}

function makeHandler(row: AttemptAiDraft | null) {
  const drafts = { findByAttempt: jest.fn(() => Promise.resolve(row)) };
  return { handler: new GetDraftForReviewHandler(drafts as never), drafts };
}

const run = (handler: GetDraftForReviewHandler) =>
  handler.execute(new GetDraftForReviewQuery('a1', 'review_draft'));

describe('GetDraftForReviewHandler', () => {
  it('hands the card the remarks and who wrote them', async () => {
    const { handler, drafts } = makeHandler(draft('READY'));

    expect(await run(handler)).toEqual({
      status: 'ready',
      items: [expect.objectContaining({ itemId: 'i1', fragment: 'i går jeg var' })],
      summary: 'Ordstilling i leddsetninger.',
      marks: null,
      modelId: 'fake-model',
      promptVersion: 'review_draft@1',
      shownToLearner: false,
      createdAt: CREATED,
    });
    expect(drafts.findByAttempt).toHaveBeenCalledWith('a1', 'review_draft');
  });

  it('reads a failed draft as none: there is no text to show', async () => {
    expect(await run(makeHandler(draft('FAILED')).handler)).toBeNull();
  });

  it('is null when the model never drafted this one', async () => {
    expect(await run(makeHandler(null).handler)).toBeNull();
  });

  it('keeps a settled draft readable, by its lowercase status', async () => {
    expect((await run(makeHandler(draft('EDITED')).handler))?.status).toBe('edited');
  });
});
