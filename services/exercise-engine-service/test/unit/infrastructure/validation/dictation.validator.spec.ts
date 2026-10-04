import {
  DIFF_FIXTURE,
  emptyContent,
  opSignature,
  toContent,
  toExpectedAnswers,
  toStudentProjection,
} from '@ssz/shared-kernel/dictation';
import type {
  DictationContent,
  DiffOp,
  Segment,
  SegmentState,
  Settings,
  WordCounts,
} from '@ssz/shared-kernel/dictation';
import { DictationValidator } from '../../../../src/infrastructure/validation/validators/dictation.validator.js';

// The grading is the kernel's and is tested there, over the same build; the handler's seam —
// carrying the segment states, the clock, publishing once — is tested in
// submit-answer.handler.spec. What is left here is what the server must hold on its own: that
// it diffs exactly as the client does on the shared fixture (AC-M1), what an answer may carry
// before the sentence is closed (AC-X2), the reveal (AC-R9), the throttle (AC-X6), and the
// shape of a submission.

const A = 'På kjøkkenet står det en skje.';
const B = 'Vi hadde ikke hørt noe i går.';

function segment(id: string, text: string, patch: Partial<Segment> = {}): Segment {
  return { id, text, audio: null, why: `${id} — why`, focus: [], ...patch };
}

function exercise(
  segments: Segment[],
  settings: Partial<Settings> = {},
  patch: Partial<DictationContent> = {},
): DictationContent {
  const base = emptyContent('nb', 'Hør og skriv.');
  return {
    ...base,
    title: 'Diktat',
    audio: { ...base.audio, assetId: 'asset-1', title: 'Klipp', duration: 20 },
    segments,
    settings: { ...base.settings, ...settings },
    ...patch,
  };
}

const sample = (settings: Partial<Settings> = {}, patch: Partial<DictationContent> = {}) =>
  exercise(
    [
      segment('a', A, { focus: [{ id: 'f1', wordIndex: 1, why: 'kj- foran ø.' }] }),
      segment('b', B),
    ],
    settings,
    patch,
  );

const validator = new DictationValidator();

function run(ex: DictationContent, submittedAnswer: unknown) {
  return validator.validate({
    submittedAnswer,
    content: toContent(ex),
    expectedAnswers: toExpectedAnswers(ex),
    checkSettings: {},
    targetLanguage: 'nb',
  });
}

interface Details {
  segmentId: string;
  pct: number;
  passed: boolean;
  words: WordCounts;
  ops: Array<DiffOp & { why?: string }>;
  focus: Array<{ focusId: string; word: string; why: string }>;
  why?: string;
  key?: { text: string; why: string; focus: unknown[] };
  transcriptSlice?: string;
  attempt: number;
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  segments: SegmentState[];
  complete: boolean;
}

function details(result: ReturnType<typeof run>): Details {
  if (!result.isOk) throw new Error(`refused: ${result.error.code}`);
  return result.value.details as Details;
}

describe('DictationValidator — the shared fixture (AC-M1)', () => {
  // A blank answer never reaches the grader (AC-R4, and the shape test below), so the
  // fixture's empty-answer case is the kernel's alone.
  const cases = DIFF_FIXTURE.filter((c) => c.typed.trim() !== '');

  it('covers the fixture but its empty-answer case', () => {
    expect(cases.length).toBe(DIFF_FIXTURE.length - 1);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const ex = exercise(
      [segment('s', c.expected, { focus: c.focus.map((wordIndex, i) => ({ id: `f${i}`, wordIndex, why: '' })) })],
      { attempts: 0 },
      { language: c.language, marking: { ...emptyContent().marking, ...c.marking } },
    );
    const d = details(run(ex, { segmentId: 's', text: c.typed }));

    expect(d.ops.map(opSignature)).toEqual(c.ops);
    expect(d.words).toEqual(c.words);
    expect(d.pct).toBe(Math.round((Math.max(0, c.num2) / (2 * c.words.total)) * 100));
  });
});

describe('DictationValidator — one segment per submit', () => {
  it('grades the segment and reports the attempt: mean of first checks over ready segments', () => {
    const result = run(sample(), { segmentId: 'a', text: A });

    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({
      correct: true,
      score: 50,
      passed: false,
      inProgress: true,
      requiresReview: false,
    });
    expect(details(result)).toMatchObject({ segmentId: 'a', pct: 100, passed: true, closed: true, complete: false });
  });

  it('the submit that closes the last segment closes the attempt', () => {
    const first = details(run(sample(), { segmentId: 'a', text: A }));
    const result = run(sample(), { segmentId: 'b', text: B, segments: first.segments });

    expect(result.value).toMatchObject({ score: 100, passed: true, inProgress: false });
  });

  it('never routes to a teacher (AC-X4)', () => {
    expect(run(sample(), { segmentId: 'a', text: 'feil' }).value.requiresReview).toBe(false);
  });
});

describe('DictationValidator — what an answer may carry (AC-X2, AC-R7, AC-R9)', () => {
  it('a failed check: the corrected line, the wrong focus word by name, the reason — no sentence, no slice', () => {
    const d = details(run(sample(), { segmentId: 'a', text: 'På sjøkkenet står det en sje.' }));

    expect(d.passed).toBe(false);
    expect(d.focus).toEqual([{ focusId: 'f1', word: 'kjøkkenet', why: 'kj- foran ø.' }]);
    expect(d.why).toBe('a — why');
    expect(d).not.toHaveProperty('key');
    expect(d).not.toHaveProperty('transcriptSlice');
    // Nothing of the other sentence, which nobody has written yet.
    const json = JSON.stringify(d);
    for (const word of ['hadde', 'hørt', 'b — why']) expect(json).not.toContain(word);
  });

  it('no reason without hints', () => {
    const d = details(run(sample({ hints: false }), { segmentId: 'a', text: 'feil' }));
    expect(d).not.toHaveProperty('why');
  });

  it('the transcript slice comes only with the closing check, and only of that sentence', () => {
    const d = details(run(sample(), { segmentId: 'a', text: A }));
    expect(d.transcriptSlice).toBe(A);
    expect(JSON.stringify(d)).not.toContain('hadde');
  });

  it('a reveal returns the sentence, its reason and its focus words, and closes the segment', () => {
    const checked = details(run(sample(), { segmentId: 'a', text: 'feil' }));
    const d = details(run(sample(), { segmentId: 'a', reveal: true, segments: checked.segments }));

    expect(d).toMatchObject({ revealed: true, closed: true, ops: [] });
    expect(d.key).toEqual({
      text: A,
      why: 'a — why',
      focus: [{ focusId: 'f1', word: 'kjøkkenet', why: 'kj- foran ø.' }],
    });
  });

  it('after a reveal, a check of that segment is refused (AC-R9)', () => {
    const checked = details(run(sample(), { segmentId: 'a', text: 'feil' }));
    const revealed = details(run(sample(), { segmentId: 'a', reveal: true, segments: checked.segments }));

    const again = run(sample(), { segmentId: 'a', text: A, segments: revealed.segments });
    expect(again.isFail).toBe(true);
    expect(again.error.code).toBe('DICT_SEGMENT_CLOSED');
  });

  it('a reveal before any check is refused', () => {
    expect(run(sample(), { segmentId: 'a', reveal: true }).error?.code).toBe('DICT_REVEAL_NOT_ALLOWED');
  });

  it('an unknown segment is refused', () => {
    expect(run(sample(), { segmentId: 'zz', text: A }).error?.code).toBe('DICT_SEGMENT_UNKNOWN');
  });

  it('the student projection carries no key: segment keys are exactly id (AC-R3)', () => {
    const ex = sample();
    const projection = toStudentProjection(toContent(ex), toExpectedAnswers(ex));
    expect(projection.segments.map((s) => Object.keys(s))).toEqual([['id'], ['id']]);
  });
});

describe('DictationValidator — the throttle (AC-X6, Q4-A)', () => {
  it('a second check of one segment inside two seconds is refused; after, it is graded', () => {
    const first = details(run(sample(), { segmentId: 'a', text: 'feil', now: 10_000 }));

    const soon = run(sample(), { segmentId: 'a', text: 'feil igjen', segments: first.segments, now: 11_999 });
    expect(soon.error?.code).toBe('DICT_TOO_FAST');

    const later = run(sample(), { segmentId: 'a', text: 'feil igjen', segments: first.segments, now: 12_000 });
    expect(later.isOk).toBe(true);
  });

  it('is per segment: the next sentence may be checked at once', () => {
    const first = details(run(sample(), { segmentId: 'a', text: 'feil', now: 10_000 }));
    const other = run(sample(), { segmentId: 'b', text: B, segments: first.segments, now: 10_001 });
    expect(other.isOk).toBe(true);
  });
});

describe('DictationValidator — the shape of a submission', () => {
  it.each([
    ['not an object', 'På kjøkkenet'],
    ['an array', [{ segmentId: 'a', text: A }]],
    ['no segment', { text: A }],
    ['an empty segment id', { segmentId: '', text: A }],
    ['no text on a check', { segmentId: 'a' }],
    ['text that is not a string', { segmentId: 'a', text: 42 }],
    ['blank text on a check (AC-R4)', { segmentId: 'a', text: '   \n' }],
    ['text far beyond any sentence', { segmentId: 'a', text: 'ord '.repeat(1001) }],
  ])('refuses %s', (_name, answer) => {
    const result = run(sample(), answer);
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('a reveal needs no text', () => {
    const checked = details(run(sample(), { segmentId: 'a', text: 'feil' }));
    expect(run(sample(), { segmentId: 'a', reveal: true, segments: checked.segments }).isOk).toBe(true);
  });
});
