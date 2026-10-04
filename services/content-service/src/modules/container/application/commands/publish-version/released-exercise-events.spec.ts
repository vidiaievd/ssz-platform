import { releasedExerciseEvents } from './released-exercise-events.js';

// A publish tells learning-service which pieces each released exercise still has, so the
// review cards on a deleted piece can go (plan 68, SPEC_data_model §5).

describe('releasedExerciseEvents', () => {
  it('names the pieces of an addressable exercise as its verdicts spell them', () => {
    const [event] = releasedExerciseEvents([
      {
        exerciseId: 'ex-1',
        templateCode: 'dictation',
        content: { mode: 'segments', language: 'nb', segments: [{ id: 's1' }, { id: 's3' }] },
        expectedAnswers: {
          segments: {
            s1: { text: 'Hun går til butikken.', why: '', focus: [] },
            s3: { text: 'Han kjører bil.', why: '', focus: [] },
          },
          orphans: [],
        },
      },
    ]);

    expect(event?.eventType).toBe('content.exercise.released');
    expect(event?.payload).toEqual({
      exerciseId: 'ex-1',
      templateCode: 'dictation',
      itemKeys: ['s1', 's3'],
    });
  });

  it('says null for a template that grades as a whole', () => {
    const [event] = releasedExerciseEvents([
      { exerciseId: 'ex-2', templateCode: 'writing_task', content: {}, expectedAnswers: {} },
    ]);

    expect(event?.payload.itemKeys).toBeNull();
  });

  it('says an empty list, not null, for an addressable exercise left with no pieces', () => {
    // Every card on it goes — the difference null would erase.
    const [event] = releasedExerciseEvents([
      {
        exerciseId: 'ex-3',
        templateCode: 'dictation',
        content: { mode: 'segments', language: 'nb', segments: [] },
        expectedAnswers: { segments: {}, orphans: [] },
      },
    ]);

    expect(event?.payload.itemKeys).toEqual([]);
  });
});
