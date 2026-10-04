import {
  tokenize,
  TOKENIZER_FIXTURE,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/highlight-in-text';
import type {
  HighlightInTextContent,
  Question,
  Settings,
} from '@ssz/shared-kernel/highlight-in-text';
import { HighlightInTextValidator } from '../../../../src/infrastructure/validation/validators/highlight-in-text.validator.js';

// The grading is the kernel's and is tested there, over the same build; the handler's seam —
// carrying the question states, publishing once — is tested in submit-answer.handler.spec.
// What is left here is what the server must hold on its own: that it tokenizes the passage
// exactly as the client does (AC-M1), that the acceptance arithmetic comes out of the
// validator as well as out of the kernel (AC-G1–G7), what an answer may carry (AC-S5, S9),
// and the shape of a submission.

const SETTINGS: Settings = {
  attempts: 0,
  threshold: 70,
  penalty: 'half',
  showCount: false,
  hints: true,
  revealKey: true,
};

/** The character range of the `nth` (1-based) token run spelling `phrase`. */
function at(text: string, phrase: string, nth = 1): { start: number; end: number } {
  const tokens = tokenize(text);
  const words = tokenize(phrase).map((t) => t.w);
  let seen = 0;
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, j) => tokens[i + j]?.w === w)) {
      seen += 1;
      if (seen === nth) return { start: tokens[i]!.s, end: tokens[i + words.length - 1]!.e };
    }
  }
  throw new Error(`fixture: "${phrase}" #${nth} is not in the text`);
}

function question(
  id: string,
  text: string,
  phrases: string[],
  over: Partial<Question> = {},
): Question {
  return {
    id,
    prompt: `Prompt ${id}`,
    unit: 'word',
    spans: phrases.map((p, i) => ({ id: `${id}-s${i}`, ...at(text, p), why: `${p} — why` })),
    missHint: `${id} miss`,
    fpHint: `${id} fp`,
    ...over,
  };
}

function exercise(
  text: string,
  questions: Question[],
  settings: Partial<Settings> = {},
): HighlightInTextContent {
  return {
    title: 'T',
    instruction: '',
    text,
    questions,
    orphans: [],
    settings: { ...SETTINGS, ...settings },
  };
}

/** `w1 … wn.` with one question keyed on the first `keys` words — for the arithmetic. */
function counted(n: number, keys: number, settings: Partial<Settings> = {}) {
  const words = Array.from({ length: n }, (_, i) => `w${i + 1}`);
  const text = `${words.join(' ')}.`;
  return {
    text,
    words,
    ex: exercise(text, [question('q1', text, words.slice(0, keys))], settings),
  };
}

function validate(ex: HighlightInTextContent, submittedAnswer: unknown) {
  return new HighlightInTextValidator().validate({
    submittedAnswer,
    content: toContent(ex),
    expectedAnswers: toExpectedAnswers(ex),
    checkSettings: {},
    targetLanguage: 'nb',
  });
}

type Details = Record<string, unknown> & {
  pct: number;
  passed: boolean;
  cells: Array<Record<string, unknown>>;
  questions: Array<Record<string, unknown>>;
};
const detailsOf = (result: ReturnType<typeof validate>) => result.value.details as Details;

describe('HighlightInTextValidator', () => {
  describe('the tokenizer is the client’s, to the character (AC-M1)', () => {
    it('cuts the shared fixture into the same words as the kernel test does', () => {
      expect(tokenize(TOKENIZER_FIXTURE.text).map((t) => t.w)).toEqual([
        ...TOKENIZER_FIXTURE.words,
      ]);
    });

    it('grades marks laid by plain string search as exact — the boundaries agree', () => {
      // The key comes from the tokenizer; the marks come from `indexOf`, which knows nothing
      // about tokens. Hyphens and both apostrophes are where two tokenizers would disagree.
      const text = TOKENIZER_FIXTURE.text;
      const hard = ['e-post', "don't", 'barn’s', 'sjølv-stendige', '1998'];
      const ex = exercise(text, [question('q1', text, hard)]);
      const marks = hard.map((w) => ({ start: text.indexOf(w), end: text.indexOf(w) + w.length }));

      const result = validate(ex, { questionId: 'q1', marks });

      expect(result.isOk).toBe(true);
      expect(detailsOf(result)).toMatchObject({ exact: 5, near: 0, fp: 0, miss: 0, pct: 100 });
    });

    it('snaps a mark over «Bodø,» to «Bodø» (AC-M2)', () => {
      const text = TOKENIZER_FIXTURE.text;
      const ex = exercise(text, [question('q1', text, ['Bodø'])]);
      const start = text.indexOf('Bodø,');

      const result = validate(ex, {
        questionId: 'q1',
        marks: [{ start, end: start + 'Bodø,'.length }],
      });

      expect(detailsOf(result).cells).toEqual([
        { start, end: start + 'Bodø'.length, state: 'exact' },
      ]);
    });
  });

  describe('the arithmetic of the acceptance criteria', () => {
    const mark = (text: string, words: string[]) => words.map((w) => at(text, w));

    it('9 keys, 7 exact, nothing extra, penalty half → 78% (AC-G1)', () => {
      const { text, words, ex } = counted(30, 9);
      const result = validate(ex, { questionId: 'q1', marks: mark(text, words.slice(0, 7)) });
      expect(detailsOf(result)).toMatchObject({ pct: 78, passed: true, exact: 7, fp: 0, miss: 2 });
      expect(result.value.score).toBe(78);
    });

    it('9 keys, 7 exact, 4 extra, penalty half → 56% (AC-G2)', () => {
      const { text, words, ex } = counted(30, 9);
      const marks = mark(text, [...words.slice(0, 7), ...words.slice(20, 24)]);
      expect(detailsOf(validate(ex, { questionId: 'q1', marks }))).toMatchObject({
        pct: 56,
        passed: false,
        fp: 4,
      });
    });

    it('the same with penalty off → 78% (AC-G3)', () => {
      const { text, words, ex } = counted(30, 9, { penalty: 'off' });
      const marks = mark(text, [...words.slice(0, 7), ...words.slice(20, 24)]);
      expect(detailsOf(validate(ex, { questionId: 'q1', marks }))).toMatchObject({
        pct: 78,
        passed: true,
      });
    });

    it('marking every word scores 0 and fails the attempt (AC-G4)', () => {
      const { text, words, ex } = counted(40, 9);
      const result = validate(ex, { questionId: 'q1', marks: mark(text, words) });
      expect(detailsOf(result)).toMatchObject({ pct: 0, passed: false, exact: 9, fp: 31 });
      expect(result.value).toMatchObject({ score: 0, passed: false });
    });

    it('a mark overlapping a key span with other edges is neither right nor extra (AC-G5)', () => {
      const text = 'I fjor sommer reiste vi til Bodø.';
      const ex = exercise(text, [question('q1', text, ['I fjor sommer'], { unit: 'phrase' })]);
      const result = validate(ex, { questionId: 'q1', marks: [at(text, 'sommer')] });
      const key = at(text, 'I fjor sommer');
      expect(detailsOf(result)).toMatchObject({ exact: 0, near: 1, fp: 0, miss: 0 });
      expect(detailsOf(result).cells).toEqual([
        { ...at(text, 'sommer'), state: 'near', keyStart: key.start, keyEnd: key.end },
      ]);
    });

    it('merges two overlapping marks before grading (AC-G6)', () => {
      const text = 'I fjor sommer reiste vi til Bodø.';
      const ex = exercise(text, [question('q1', text, ['I fjor sommer'], { unit: 'phrase' })]);
      const marks = [at(text, 'I fjor'), at(text, 'fjor sommer')];
      expect(detailsOf(validate(ex, { questionId: 'q1', marks }))).toMatchObject({
        exact: 1,
        fp: 0,
        pct: 100,
      });
    });

    it('refuses a mark that covers no word (AC-G7)', () => {
      const text = 'Vi reiste — til Bodø.';
      const ex = exercise(text, [question('q1', text, ['reiste'])]);
      const dash = text.indexOf('—');
      const result = validate(ex, {
        questionId: 'q1',
        marks: [{ start: dash - 1, end: dash + 2 }],
      });
      expect(result.isFail).toBe(true);
      expect(result.error.code).toBe('HT_MARK_UNSNAPPABLE');
    });
  });

  describe('what an answer may carry', () => {
    const text = 'I fjor sommer reiste vi til Bodø. Der bodde vi hos tante Kari og spiste fisk.';
    const ex = exercise(text, [question('q1', text, ['reiste', 'bodde', 'spiste'])]);

    it('a failed check names how many were missed, never where (AC-S5)', () => {
      const result = validate(ex, {
        questionId: 'q1',
        marks: [at(text, 'reiste'), at(text, 'Kari')],
      });
      const details = detailsOf(result);

      expect(details).toMatchObject({
        passed: false,
        miss: 2,
        fp: 1,
        missHint: 'q1 miss',
        fpHint: 'q1 fp',
      });
      expect(details).not.toHaveProperty('key');
      // Only the student's own two marks come back; nothing at the missed spans' offsets.
      expect(details.cells.map((c) => c.start)).toEqual([
        at(text, 'reiste').start,
        at(text, 'Kari').start,
      ]);
      const json = JSON.stringify(details);
      for (const missed of ['bodde', 'spiste']) {
        expect(json).not.toContain(`"start":${at(text, missed).start}`);
        expect(json).not.toContain(`${missed} — why`);
      }
    });

    it('sends no hint without `settings.hints`', () => {
      const quiet = exercise(text, ex.questions, { hints: false });
      const details = detailsOf(validate(quiet, { questionId: 'q1', marks: [at(text, 'Kari')] }));
      expect(details).not.toHaveProperty('missHint');
      expect(details).not.toHaveProperty('fpHint');
    });

    it('a reveal returns the key with ordinals and reasons, and closes the question (AC-S9)', () => {
      const first = validate(ex, { questionId: 'q1', marks: [at(text, 'Kari')] });
      const carried = detailsOf(first).questions;

      const reveal = validate(ex, { questionId: 'q1', reveal: true, questions: carried });
      expect(detailsOf(reveal)).toMatchObject({ revealed: true, closed: true, passed: false });
      expect(detailsOf(reveal)['key']).toEqual([
        { n: 1, ...at(text, 'reiste'), why: 'reiste — why' },
        { n: 2, ...at(text, 'bodde'), why: 'bodde — why' },
        { n: 3, ...at(text, 'spiste'), why: 'spiste — why' },
      ]);

      const after = validate(ex, {
        questionId: 'q1',
        marks: [at(text, 'reiste')],
        questions: detailsOf(reveal).questions,
      });
      expect(after.error.code).toBe('HT_QUESTION_CLOSED');
    });

    it('refuses a reveal before any check, and with `revealKey` off', () => {
      expect(validate(ex, { questionId: 'q1', reveal: true }).error.code).toBe(
        'HT_REVEAL_NOT_ALLOWED',
      );

      const locked = exercise(text, ex.questions, { revealKey: false });
      const first = detailsOf(validate(locked, { questionId: 'q1', marks: [at(text, 'Kari')] }));
      expect(
        validate(locked, { questionId: 'q1', reveal: true, questions: first.questions }).error.code,
      ).toBe('HT_REVEAL_NOT_ALLOWED');
    });

    it('publishes on the submit that closes the last question, and on no other', () => {
      const two = exercise(text, [
        question('q1', text, ['reiste']),
        question('q2', text, ['Bodø']),
      ]);
      const first = validate(two, { questionId: 'q1', marks: [at(text, 'reiste')] });
      expect(first.value).toMatchObject({
        evidenceNow: false,
        correct: true,
        score: 50,
        passed: false,
      });

      const second = validate(two, {
        questionId: 'q2',
        marks: [at(text, 'Bodø')],
        questions: detailsOf(first).questions,
      });
      expect(second.value).toMatchObject({ evidenceNow: true, score: 100, passed: true });
      expect(detailsOf(second).questions.map((q) => [q['questionId'], q['firstPassed']])).toEqual([
        ['q1', true],
        ['q2', true],
      ]);
    });
  });

  describe('the shape of a submission', () => {
    const text = 'Vi reiste til Bodø.';
    const ex = exercise(text, [question('q1', text, ['reiste'])]);

    it.each([
      ['no question', { marks: [{ start: 3, end: 9 }] }],
      ['no marks on a check', { questionId: 'q1', marks: [] }],
      ['marks not a list', { questionId: 'q1', marks: { start: 3, end: 9 } }],
      ['an empty range', { questionId: 'q1', marks: [{ start: 3, end: 3 }] }],
      ['a negative offset', { questionId: 'q1', marks: [{ start: -1, end: 9 }] }],
      ['a fractional offset', { questionId: 'q1', marks: [{ start: 3.5, end: 9 }] }],
      ['not an object', ['q1']],
    ])('refuses %s as a schema mismatch', (_label, submitted) => {
      expect(validate(ex, submitted).error.code).toBe('SCHEMA_MISMATCH');
    });

    it('refuses a question the exercise does not have, or one that is not ready', () => {
      expect(validate(ex, { questionId: 'nope', marks: [at(text, 'reiste')] }).error.code).toBe(
        'HT_QUESTION_UNKNOWN',
      );
      const unready = exercise(text, [question('q1', text, ['reiste']), question('q2', text, [])]);
      expect(validate(unready, { questionId: 'q2', marks: [at(text, 'reiste')] }).error.code).toBe(
        'HT_QUESTION_UNKNOWN',
      );
    });
  });
});
