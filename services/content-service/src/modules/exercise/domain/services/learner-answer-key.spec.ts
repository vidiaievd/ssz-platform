import { learnerAnswerKey } from './learner-answer-key.js';

const WRITING_KEY = {
  points: { p1: { keywords: ['søknad', 'stilling'] }, p2: { keywords: ['erfaring'] } },
  rubric: { c1: { levels: ['svak', 'ok', 'god', 'utmerket'] } },
  model: 'Hei! Jeg søker stillingen som …',
};

function writingContent(showRubric: string): unknown {
  return { mode: 'free', settings: { showRubric } };
}

describe('learnerAnswerKey', () => {
  it('refuses a read_aloud key: a teacher judges it, no device checks it', () => {
    expect(learnerAnswerKey('read_aloud', {}, { anything: true })).toEqual({ kind: 'refused' });
  });

  it('serves the key of an offline-graded template untouched', () => {
    const key = { items: [{ id: 'q1', correct: ['b'] }] };
    expect(learnerAnswerKey('multiple_choice', {}, key)).toEqual({
      kind: 'served',
      expectedAnswers: key,
    });
  });

  it('strips the model answer and the point keywords from a writing_task key', () => {
    const result = learnerAnswerKey('writing_task', writingContent('afterGraded'), WRITING_KEY);

    expect(result).toEqual({
      kind: 'served',
      expectedAnswers: {
        points: { p1: { keywords: [] }, p2: { keywords: [] } },
        rubric: {},
        model: '',
      },
    });
  });

  it('keeps the rubric descriptors when the author shows the rubric as a writing guide', () => {
    const result = learnerAnswerKey('writing_task', writingContent('always'), WRITING_KEY);

    expect(result).toEqual({
      kind: 'served',
      expectedAnswers: {
        points: { p1: { keywords: [] }, p2: { keywords: [] } },
        rubric: WRITING_KEY.rubric,
        model: '',
      },
    });
  });

  it('never leaks a keyword or the model through a malformed writing_task key', () => {
    const result = learnerAnswerKey('writing_task', null, { model: 'secret', stray: 'x' });

    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('stray');
  });
});
