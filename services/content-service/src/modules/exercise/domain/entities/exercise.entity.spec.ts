import { ExerciseEntity } from './exercise.entity.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../container/domain/value-objects/visibility.vo.js';

const LIVE_AT = new Date('2026-08-05T10:00:00.000Z');

function makeExercise(): ExerciseEntity {
  return ExerciseEntity.reconstitute('exercise-1', {
    exerciseTemplateId: 'template-1',
    templateCode: 'word_bank_gap_fill',
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.B1,
    content: { sentences: ['live'] },
    expectedAnswers: { feedback: { a: 'live' } },
    answerCheckSettings: null,
    ownerUserId: 'user-1',
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    estimatedDurationSeconds: 60,
    createdAt: LIVE_AT,
    updatedAt: LIVE_AT,
    deletedAt: null,
    draft: null,
    instructions: null,
  });
}

describe('ExerciseEntity drafts', () => {
  it('keeps an edited document away from the live columns', () => {
    const exercise = makeExercise();

    exercise.update({ content: { sentences: ['edited'] } });

    // What a student is served is untouched — the whole point of the split.
    expect(exercise.content).toEqual({ sentences: ['live'] });
    expect(exercise.authoringContent).toEqual({ sentences: ['edited'] });
    expect(exercise.hasDraft).toBe(true);
  });

  it('materialises the untouched half of the document into the draft', () => {
    // Publishing copies the draft wholesale, so a draft holding only the edited
    // half would release the edit and silently wipe the rest.
    const exercise = makeExercise();

    exercise.update({ content: { sentences: ['edited'] } });

    expect(exercise.draft?.expectedAnswers).toEqual({ feedback: { a: 'live' } });
  });

  it('builds the next draft on the last one, not on the live document', () => {
    const exercise = makeExercise();

    exercise.update({ content: { sentences: ['first'] } });
    exercise.update({ expectedAnswers: { feedback: { a: 'second' } } });

    expect(exercise.authoringContent).toEqual({ sentences: ['first'] });
    expect(exercise.authoringExpectedAnswers).toEqual({ feedback: { a: 'second' } });
  });

  it('leaves nothing pending when an edit is walked back', () => {
    const exercise = makeExercise();

    exercise.update({ content: { sentences: ['edited'] } });
    exercise.update({ content: { sentences: ['live'] } });

    expect(exercise.hasDraft).toBe(false);
  });

  it('moves the authoring token with the draft, not the live row', () => {
    const exercise = makeExercise();

    exercise.update({ content: { sentences: ['edited'] } });

    expect(exercise.updatedAt).toEqual(LIVE_AT);
    expect(exercise.contentUpdatedAt).not.toEqual(LIVE_AT);
  });

  it('keeps metadata live: it is not what a student reads', () => {
    const exercise = makeExercise();

    exercise.update({ estimatedDurationSeconds: 120 });

    expect(exercise.estimatedDurationSeconds).toBe(120);
    expect(exercise.hasDraft).toBe(false);
  });

  it('releases the draft on promotion and leaves nothing behind', () => {
    const exercise = makeExercise();
    exercise.update({ content: { sentences: ['edited'] } });

    expect(exercise.promoteDraft()).toBe(true);

    expect(exercise.content).toEqual({ sentences: ['edited'] });
    expect(exercise.hasDraft).toBe(false);
  });

  it('reports nothing to promote when no edit is waiting', () => {
    expect(makeExercise().promoteDraft()).toBe(false);
  });

  it('restores what students see when a draft is discarded', () => {
    const exercise = makeExercise();
    exercise.update({ content: { sentences: ['edited'] } });

    exercise.discardDraft();

    expect(exercise.authoringContent).toEqual({ sentences: ['live'] });
  });
});
