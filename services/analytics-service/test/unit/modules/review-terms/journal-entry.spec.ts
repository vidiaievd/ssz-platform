import { journalEntryOf } from '../../../../src/modules/review-terms/domain/journal-entry.js';

const work = {
  attemptId: 'a1',
  userId: 'u1',
  exerciseId: 'e1',
  templateCode: 'translate_to_target',
  schoolId: 's1',
};

const acceptedAtTerm = {
  ...work,
  groupId: 'g1',
  containerId: 'c1',
  capability: 'review_direct',
  modelId: 'fake-model',
  promptVersion: 'review_direct@2',
  outcome: 'approved',
  acceptedAtTerm: true,
  occurredAt: '2026-11-01T09:05:00.000Z',
};

const revision = {
  ...work,
  reviewerId: 't1',
  containerId: 'c1',
  outcome: 'returned',
  revisesVerdict: true,
  occurredAt: '2026-11-02T12:00:00.000Z',
};

describe('journalEntryOf (plan 80, 6a)', () => {
  it('opens a row for a model’s verdict counted at the term', () => {
    expect(journalEntryOf('exercise.attempt.ai_reviewed', acceptedAtTerm)).toEqual({
      kind: 'accepted',
      ...work,
      groupId: 'g1',
      containerId: 'c1',
      capability: 'review_direct',
      modelId: 'fake-model',
      promptVersion: 'review_direct@2',
      aiOutcome: 'approved',
      acceptedAt: new Date('2026-11-01T09:05:00.000Z'),
    });
  });

  it('writes the teacher’s verdict after the term on the same work', () => {
    expect(journalEntryOf('exercise.attempt.reviewed', revision)).toEqual({
      kind: 'revised',
      ...work,
      revisedBy: 't1',
      revisedOutcome: 'returned',
      revisedAt: new Date('2026-11-02T12:00:00.000Z'),
    });
  });

  it('takes a work in no group, and an event from before the group rode along', () => {
    const { groupId: _g, containerId: _c, ...older } = acceptedAtTerm;
    expect(journalEntryOf('exercise.attempt.ai_reviewed', { ...acceptedAtTerm, groupId: null })).toMatchObject({
      groupId: null,
    });
    expect(journalEntryOf('exercise.attempt.ai_reviewed', older)).toMatchObject({ groupId: null, containerId: null });
  });

  it('skips verdicts that are neither', () => {
    const { acceptedAtTerm: _t, ...atOnce } = acceptedAtTerm;
    const { revisesVerdict: _r, ...firstVerdict } = revision;
    expect(journalEntryOf('exercise.attempt.ai_reviewed', atOnce)).toBe('skip');
    expect(journalEntryOf('exercise.attempt.reviewed', firstVerdict)).toBe('skip');
  });

  it('reads nothing it cannot write', () => {
    // A term is a school's: no school is a broken letter, not a skip.
    expect(journalEntryOf('exercise.attempt.ai_reviewed', { ...acceptedAtTerm, schoolId: null })).toBeNull();
    expect(journalEntryOf('exercise.attempt.ai_reviewed', { ...acceptedAtTerm, outcome: 'maybe' })).toBeNull();
    expect(journalEntryOf('exercise.attempt.reviewed', { ...revision, occurredAt: 'yesterday' })).toBeNull();
    expect(journalEntryOf('exercise.attempt.ai_review_disputed', acceptedAtTerm)).toBeNull();
    expect(journalEntryOf('exercise.attempt.ai_reviewed', null)).toBeNull();
  });
});
