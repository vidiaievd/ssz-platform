import { MultipleChoiceGroupValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice-group.validator.js';

const validator = new MultipleChoiceGroupValidator();

type Item = { id: string; correct_option_ids: string[]; explanation?: string };

const run = (
  submittedItems: Item[],
  expectedItems: Item[],
  settings: Record<string, unknown> = {},
) =>
  validator.validate({
    submittedAnswer: { items: submittedItems },
    expectedAnswers: { items: expectedItems },
    checkSettings: settings,
    targetLanguage: 'no',
  });

// A Riktig / Galt block: four statements about the same text.
const expected: Item[] = [
  { id: '1', correct_option_ids: ['r'] },
  { id: '2', correct_option_ids: ['g'], explanation: 'The advert asks for three years.' },
  { id: '3', correct_option_ids: ['g'] },
  { id: '4', correct_option_ids: ['r'] },
];

const pick = (id: string, option: string): Item => ({ id, correct_option_ids: [option] });

describe('MultipleChoiceGroupValidator', () => {
  it('scores 100 when every question matches the key', () => {
    const result = run([pick('1', 'r'), pick('2', 'g'), pick('3', 'g'), pick('4', 'r')], expected);

    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('gives partial credit per question by default', () => {
    const result = run([pick('1', 'r'), pick('2', 'r'), pick('3', 'g'), pick('4', 'g')], expected);

    expect(result.value.score).toBe(50);
    expect(result.value.correct).toBe(false);
  });

  it('counts a skipped question as wrong rather than dropping it', () => {
    const result = run([pick('1', 'r'), pick('2', 'g'), pick('3', 'g')], expected);

    expect(result.value.score).toBe(75);
    const items = (result.value.details as { items: Array<{ item_id: string; correct: boolean }> })
      .items;
    expect(items).toHaveLength(4);
    expect(items[3]).toMatchObject({ item_id: '4', correct: false, submitted: [] });
  });

  it('reports each question with the key and the author note behind it', () => {
    const result = run([pick('1', 'r'), pick('2', 'r'), pick('3', 'g'), pick('4', 'r')], expected);

    const items = (
      result.value.details as {
        items: Array<{
          item_id: string;
          correct: boolean;
          submitted: string[];
          expected: string[];
          explanation?: string;
        }>;
      }
    ).items;
    expect(items[1]).toEqual({
      item_id: '2',
      correct: false,
      submitted: ['r'],
      expected: ['g'],
      explanation: 'The advert asks for three years.',
    });
    expect(items[0]!.explanation).toBeUndefined();
  });

  it('scores all-or-nothing when partial credit is switched off', () => {
    const nearly = [pick('1', 'r'), pick('2', 'g'), pick('3', 'g'), pick('4', 'g')];

    expect(run(nearly, expected, { allow_partial_credit: false }).value.score).toBe(0);
    expect(
      run([pick('1', 'r'), pick('2', 'g'), pick('3', 'g'), pick('4', 'r')], expected, {
        allow_partial_credit: false,
      }).value.score,
    ).toBe(100);
  });

  it('needs every option of a multi-answer question, no more and no less', () => {
    const multi: Item[] = [{ id: '1', correct_option_ids: ['a', 'c'] }];

    expect(run([{ id: '1', correct_option_ids: ['c', 'a'] }], multi).value.score).toBe(100);
    expect(run([{ id: '1', correct_option_ids: ['a'] }], multi).value.score).toBe(0);
    expect(run([{ id: '1', correct_option_ids: ['a', 'b', 'c'] }], multi).value.score).toBe(0);
  });
});
