import { jest } from '@jest/globals';
import { SettleAiDraftHandler } from '../../../src/modules/ai-drafts/application/commands/settle-ai-draft/settle-ai-draft.handler.js';
import { SettleAiDraftCommand } from '../../../src/modules/ai-drafts/application/commands/settle-ai-draft/settle-ai-draft.command.js';
import {
  AttemptAiDraft,
  type AiDraftStatus,
} from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import {
  compareMarks,
  readReviewerOutcomes,
  settledStatus,
  settleOutcomes,
  type ReviewerOutcomes,
} from '../../../src/modules/ai-drafts/domain/draft-outcomes.js';

const CREATED = new Date('2026-10-22T10:00:00Z');
const remark = (itemId: string, fragment: string) => ({
  itemId,
  sentenceIndex: 1,
  aspect: 'grammar',
  fragment,
  comment: 'c',
  suggestion: null,
});

const MARKS = [
  { criterionId: 'c1', mark: 2 as const, reason: 'r' },
  { criterionId: 'c2', mark: 1 as const, reason: 'r' },
];

function draft(
  status: AiDraftStatus = 'READY',
  summary: string | null = 'Bra.',
  marks: typeof MARKS | null = null,
): AttemptAiDraft {
  return AttemptAiDraft.restore('d1', {
    attemptId: 'a1',
    capability: 'review_draft',
    status,
    items: status === 'FAILED' ? [] : [remark('i1', 'jeg var'), remark('i2', 'bodd')],
    summary: status === 'FAILED' ? null : summary,
    marks,
    errorCode: null,
    providerId: 'fake',
    modelId: 'fake-model',
    promptVersion: 'review_draft@1',
    aiCallId: 'call-1',
    createdAt: CREATED,
    updatedAt: CREATED,
  });
}

function makeHandler(row: AttemptAiDraft | null, saved: 'saved' | 'conflict' = 'saved') {
  const drafts = {
    findByAttempt: jest.fn(() => Promise.resolve(row)),
    save: jest.fn(() => Promise.resolve(saved)),
  };
  return { handler: new SettleAiDraftHandler(drafts as never), drafts };
}

const settle = (outcomes: ReviewerOutcomes) => new SettleAiDraftCommand('a1', 'review_draft', outcomes);

describe('settleOutcomes', () => {
  const shape = { remarkCount: 3, hasSummary: true };

  it('reads a remark nobody acted on as untouched', () => {
    expect(settleOutcomes(shape, { '0': 'accepted' })).toEqual({
      remarks: ['accepted', 'untouched', 'untouched'],
      summary: 'untouched',
      draftDiscarded: false,
    });
  });

  it('throws out what was still open when the whole draft is dropped, but keeps what was taken', () => {
    expect(settleOutcomes(shape, { '1': 'edited', draft: 'discarded' }).remarks).toEqual([
      'discarded',
      'edited',
      'discarded',
    ]);
  });

  it('ignores a remark the draft does not have', () => {
    expect(settleOutcomes(shape, { '7': 'accepted' }).remarks).toEqual([
      'untouched',
      'untouched',
      'untouched',
    ]);
  });

  it('has no summary outcome when the draft had no overall note', () => {
    expect(settleOutcomes({ remarkCount: 0, hasSummary: false }, { summary: 'accepted' }).summary).toBeNull();
  });
});

// Plan 79, step 1.7c.
describe('compareMarks', () => {
  it('says whether the teacher landed where the model did, and by how much they differ', () => {
    expect(compareMarks(MARKS, { c1: 2, c2: 3 })).toEqual([
      { criterionId: 'c1', outcome: 'same', delta: 0 },
      { criterionId: 'c2', outcome: 'different', delta: 2 },
    ]);
  });

  it('reads a criterion the verdict left without a valid mark as different, without a delta', () => {
    expect(compareMarks(MARKS, { c1: 9 })).toEqual([
      { criterionId: 'c1', outcome: 'different', delta: null },
      { criterionId: 'c2', outcome: 'different', delta: null },
    ]);
  });

  it('is left out of a draft that suggested no marks, and kept when the draft is dropped', () => {
    expect(settleOutcomes({ remarkCount: 1, hasSummary: false }, {}, { c1: 2 })).not.toHaveProperty('marks');
    expect(
      settleOutcomes({ remarkCount: 0, hasSummary: false, marks: MARKS }, { draft: 'discarded' }, { c1: 1, c2: 1 }).marks,
    ).toEqual([
      { criterionId: 'c1', outcome: 'different', delta: -1 },
      { criterionId: 'c2', outcome: 'same', delta: 0 },
    ]);
  });
});

describe('settledStatus', () => {
  it('is EDITED when anything was reworded, SENT when taken as written, DISCARDED otherwise', () => {
    const of = (remarks: string[], summary: string | null = null) =>
      settledStatus({ remarks: remarks as never, summary: summary as never, draftDiscarded: false });
    expect(of(['accepted', 'edited'])).toBe('EDITED');
    expect(of(['accepted', 'discarded'])).toBe('SENT');
    expect(of(['untouched'], 'accepted')).toBe('SENT');
    expect(of(['discarded', 'untouched'])).toBe('DISCARDED');
    expect(of([])).toBe('DISCARDED');
  });
});

describe('readReviewerOutcomes', () => {
  it('drops keys and values the card could not have written', () => {
    expect(
      readReviewerOutcomes({ '0': 'accepted', summary: 'edited', draft: 'discarded', x: 'accepted', '1': 'great' }),
    ).toEqual({ '0': 'accepted', summary: 'edited', draft: 'discarded' });
  });

  it('keeps "shown no draft" apart from "did nothing with it"', () => {
    expect(readReviewerOutcomes(undefined)).toBeNull();
    expect(readReviewerOutcomes({})).toEqual({});
  });
});

describe('SettleAiDraftHandler', () => {
  it('labels the draft with the verdict and keeps what the model offered', async () => {
    const row = draft();
    const { handler, drafts } = makeHandler(row);

    const settled = await handler.execute(settle({ '0': 'accepted', '1': 'discarded' }));

    expect(settled).toEqual({ remarks: ['accepted', 'discarded'], summary: 'untouched', draftDiscarded: false });
    expect(row.status).toBe('SENT');
    expect(row.outcomes).toEqual(settled);
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(row.items).toHaveLength(2);
    expect(drafts.save).toHaveBeenCalledWith(row);
  });

  it('compares suggested marks with the marks the verdict stored', async () => {
    const row = draft('READY', null, MARKS);
    const { handler } = makeHandler(row);

    await handler.execute(new SettleAiDraftCommand('a1', 'review_draft', {}, { c1: 2, c2: 2 }));

    expect(row.outcomes?.marks).toEqual([
      { criterionId: 'c1', outcome: 'same', delta: 0 },
      { criterionId: 'c2', outcome: 'different', delta: 1 },
    ]);
    // What the model suggested stays as it was.
    expect(row.marks).toEqual(MARKS);
  });

  it('settles nothing when there is no draft or it failed', async () => {
    for (const row of [null, draft('FAILED')]) {
      const { handler, drafts } = makeHandler(row);
      expect(await handler.execute(settle({ '0': 'accepted' }))).toBeNull();
      expect(drafts.save).not.toHaveBeenCalled();
    }
  });

  it('settles a draft again when the verdict that labelled it did not land', async () => {
    const row = draft();
    row.settle({ '0': 'accepted' }, null, new Date());
    const { handler } = makeHandler(row);

    await handler.execute(settle({ '0': 'edited' }));

    expect(row.status).toBe('EDITED');
  });

  it('reports a write that lost a race as unsettled', async () => {
    const { handler } = makeHandler(draft(), 'conflict');
    expect(await handler.execute(settle({ '0': 'accepted' }))).toBeNull();
  });
});
