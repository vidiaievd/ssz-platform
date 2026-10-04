import { fromPersisted, issues, tokenize } from '@ssz/shared-kernel/highlight-in-text';
import { highlightInTextViolations } from './highlight-in-text-preflight.js';

// What earns this file is that two of the type's failures do not fail loudly. A question with
// nothing marked disappears — the projection asks the key column whether a question has spans.
// And a span off the token edges of the text grades every right answer as a near miss; the
// server does not re-anchor (plan 67, Q3-A), so publication is where it is stopped.

const TEXT =
  'I fjor sommer reiste vi til Bodø. Vi bodde hos tante Kari, og hun laget middag hver dag. ' +
  'Etter en uke dro vi videre til Tromsø, der vi så midnattssola for første gang.';

/** The character range of a word in TEXT, found by the kernel's own tokenizer. */
function spanOf(id: string, word: string, why = '') {
  const token = tokenize(TEXT).find((t) => t.w === word);
  if (!token) throw new Error(`no token «${word}»`);
  return { id, start: token.s, end: token.e, why };
}

/** A finished exercise: one question, five past-tense verbs, both hints. */
function ready() {
  return {
    id: 'ex-1',
    content: {
      title: 'Preteritum',
      instruction: 'Les teksten og marker det oppgaven spør om.',
      text: TEXT,
      questions: [{ id: 'q1', prompt: 'Marker verbene i preteritum.', unit: 'word' }],
      settings: {
        attempts: 0,
        threshold: 70,
        penalty: 'half',
        showCount: false,
        hints: true,
        revealKey: true,
      },
    },
    expectedAnswers: {
      questions: {
        q1: {
          spans: [
            spanOf('s1', 'reiste', 'Preteritum av «reise».'),
            spanOf('s2', 'bodde'),
            spanOf('s3', 'laget'),
            spanOf('s4', 'dro'),
            spanOf('s5', 'så'),
          ],
          missHint: 'Se etter verb som forteller hva som skjedde i fjor.',
          fpHint: '«Bodø» og «Tromsø» er steder, ikke verb.',
        },
      } as Record<string, { spans: ReturnType<typeof spanOf>[]; missHint: string; fpHint: string }>,
      orphans: [] as Array<{ id: string; qid: string; surface: string; why: string }>,
    },
  };
}

const codesOf = (exercise: ReturnType<typeof ready>) =>
  highlightInTextViolations(exercise).map((v) => [v.ruleCode, v.severity]);

describe('highlightInTextViolations', () => {
  it('passes a finished exercise', () => {
    expect(highlightInTextViolations(ready())).toEqual([]);
  });

  it('blocks a question with a prompt and no marks, which the projection would drop', () => {
    const exercise = ready();
    exercise.content.questions.push({ id: 'q2', prompt: 'Marker tidsuttrykkene.', unit: 'phrase' });
    expect(codesOf(exercise)).toContainEqual(['HIGHLIGHTINTEXT_HT_QUESTION_NO_SPANS', 'blocker']);
  });

  it('blocks a span that no longer sits on token edges (Q3-A)', () => {
    const exercise = ready();
    // «reiste» shortened by one character on the right: a client that tokenized
    // differently would write exactly this.
    const span = exercise.expectedAnswers.questions['q1'].spans[0];
    span.end -= 1;
    const violation = highlightInTextViolations(exercise).find(
      (v) => v.ruleCode === 'HIGHLIGHTINTEXT_HT_SPAN_OFF_TOKENS',
    );
    expect(violation).toMatchObject({ severity: 'blocker', itemId: 'ex-1' });
    expect(violation?.detail).toContain('1 mark no longer sits on whole words');
  });

  it('blocks a span that crosses a paragraph', () => {
    const exercise = ready();
    const text = 'Vi reiste.\n\nVi bodde.';
    exercise.content.text = text;
    const tokens = tokenize(text);
    exercise.expectedAnswers.questions['q1'].spans = [
      { id: 's1', start: tokens[1].s, end: tokens[2].e, why: '' },
    ];
    expect(codesOf(exercise)).toContainEqual(['HIGHLIGHTINTEXT_HT_SPAN_OFF_TOKENS', 'blocker']);
  });

  it('blocks orphaned marks', () => {
    const exercise = ready();
    exercise.expectedAnswers.orphans.push({ id: 'o1', qid: 'q1', surface: 'kjørte', why: '' });
    const violation = highlightInTextViolations(exercise).find(
      (v) => v.ruleCode === 'HIGHLIGHTINTEXT_HT_ORPHANED_MARKS',
    );
    expect(violation).toMatchObject({ severity: 'blocker' });
    expect(violation?.detail).toContain('1 mark lost its words');
  });

  it('blocks a question with spans and no miss hint', () => {
    const exercise = ready();
    exercise.expectedAnswers.questions['q1'].missHint = '';
    expect(codesOf(exercise)).toEqual([['HIGHLIGHTINTEXT_HT_NO_MISS_HINT', 'blocker']]);
  });

  it('reports one violation per code, counting the questions', () => {
    const exercise = ready();
    exercise.content.questions.push(
      { id: 'q2', prompt: '', unit: 'word' },
      { id: 'q3', prompt: '', unit: 'word' },
    );
    const found = highlightInTextViolations(exercise).filter(
      (v) => v.ruleCode === 'HIGHLIGHTINTEXT_HT_QUESTION_NO_PROMPT',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain('2 questions have no wording');
  });

  it('warns that the evidence is capped, as a warning', () => {
    const exercise = ready();
    exercise.content.settings = { ...exercise.content.settings, penalty: 'off', showCount: true };
    expect(codesOf(exercise)).toEqual([
      ['HIGHLIGHTINTEXT_HT_PENALTY_OFF', 'warning'],
      ['HIGHLIGHTINTEXT_HT_COUNT_SHOWN', 'warning'],
    ]);
  });

  it('refuses an empty scaffold rather than publishing an empty exercise', () => {
    const codes = highlightInTextViolations({ id: 'x', content: {}, expectedAnswers: {} }).map(
      (v) => v.ruleCode,
    );
    expect(codes).toEqual([
      'HIGHLIGHTINTEXT_HT_NO_TEXT',
      'HIGHLIGHTINTEXT_HT_NO_TITLE',
      'HIGHLIGHTINTEXT_HT_NO_QUESTIONS',
    ]);
  });

  it('reports exactly the codes the builder shows, behind the template prefix (AC-X1, AC-X2)', () => {
    // A draft broken on every step at once: the builder's list and publication's list must
    // be the same set, or an author fixes everything the builder names and is still refused.
    const exercise = ready();
    exercise.content.title = '';
    exercise.content.questions.push(
      { id: 'q2', prompt: '', unit: 'word' },
      { id: 'q3', prompt: 'Marker verbene i preteritum.', unit: 'word' },
    );
    exercise.expectedAnswers.questions['q1'].spans[1].end -= 1;
    exercise.expectedAnswers.questions['q1'].fpHint = '';
    exercise.expectedAnswers.orphans.push({ id: 'o1', qid: 'q1', surface: 'kjørte', why: '' });
    exercise.content.settings = { ...exercise.content.settings, attempts: 1 };

    const builder = [
      ...new Set(
        issues(fromPersisted(exercise.content, exercise.expectedAnswers)).map((i) => i.code),
      ),
    ];
    const published = highlightInTextViolations(exercise).map((v) =>
      v.ruleCode.replace(/^HIGHLIGHTINTEXT_/, ''),
    );
    expect(published).toEqual(builder);
    expect(published.length).toBeGreaterThanOrEqual(6);
  });
});
