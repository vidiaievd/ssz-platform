// SPEC_data_model §4 and DECISIONS §2, as amended by decision Q7-A of plan 67.

import { describe, expect, it } from 'vitest';

import { exercise, question, SAMPLE_TEXT, spanAt } from './fixtures.test-support.js';
import type { HighlightInTextContent } from './model.js';
import { settings } from './fixtures.test-support.js';
import { canPutBack, dropOrphan, previewReanchor, putBack, reanchor } from './reanchor.js';

const surfaceOf = (ex: HighlightInTextContent, qid: string, spanId: string) => {
  const s = ex.questions.find((q) => q.id === qid)?.spans.find((x) => x.id === spanId);
  return s ? ex.text.slice(s.start, s.end) : null;
};

/** The index of the occurrence of `word` a span sits on, from 1. */
const occurrence = (text: string, start: number, word: string) => {
  let n = 0;
  let at = -1;
  do {
    at = text.indexOf(word, at + 1);
    n++;
  } while (at !== -1 && at < start);
  return at === start ? n : -1;
};

describe('reanchor', () => {
  it('AC-R1: a typo fixed elsewhere keeps every mark on its words, no orphan', () => {
    const ex = exercise();
    const next = reanchor(ex, ex.text.replace('hurtigbåten', 'hurtigbaaten'));
    expect(next.orphans).toEqual([]);
    expect(surfaceOf(next, 'q1', 'reiste')).toBe('reiste');
    expect(surfaceOf(next, 'q1', 'gikk')).toBe('gikk');
    expect(surfaceOf(next, 'q1', 'fortalte')).toBe('fortalte');
  });

  it('AC-R2: a fourth «var» inserted before the marked second one leaves the mark where it was', () => {
    const text = 'Det var kaldt. Hun var sliten. Vi var hjemme.';
    const ex: HighlightInTextContent = {
      ...exercise({ text }),
      questions: [question('q', { spans: [spanAt(text, 'var', 2, 's')] })],
    };
    const before = ex.questions[0]!.spans[0]!;
    expect(occurrence(text, before.start, 'var')).toBe(2);

    const edited = text.replace('Hun var', 'Det var vått, og hun var');
    const after = reanchor(ex, edited).questions[0]!.spans[0]!;
    // The authored «var» was the one after «Hun»; it still is.
    expect(edited.slice(after.start - 4, after.end)).toBe('hun var');
  });

  it('AC-R3: deleting the sentence orphans the mark, with its surface and explanation', () => {
    const ex = exercise();
    const next = reanchor(ex, ex.text.replace('Naboen vår fortalte at han hadde fisket i det samme vannet i førti år. ', ''));
    expect(next.orphans).toEqual(
      expect.arrayContaining([
        { id: 'fortalte', qid: 'q1', surface: 'fortalte', why: 'fortalte — why' },
        { id: 'i førti år', qid: 'q2', surface: 'i førti år', why: 'i førti år — why' },
      ]),
    );
    expect(next.questions[0]!.spans.map((s) => s.id)).not.toContain('fortalte');
  });

  it('re-punctuating and re-capitalising never orphans a mark', () => {
    const ex = exercise();
    const next = reanchor(ex, ex.text.replace('Vi tok toget til Bodø, og der', 'Vi tok toget til Bodø — Og der'));
    expect(next.orphans).toEqual([]);
    expect(surfaceOf(next, 'q1', 'tok')).toBe('tok');
  });

  it('a rewritten sentence falls back to the words: the mark follows its word into the new wording', () => {
    const ex = exercise();
    const next = reanchor(ex, ex.text.replace('Vi tok toget til Bodø', 'Først tok vi toget helt til Bodø'));
    expect(next.orphans).toEqual([]);
    expect(surfaceOf(next, 'q1', 'tok')).toBe('tok');
  });

  it('a word glued onto a mark no longer holds it there', () => {
    const text = 'Det var kaldt.';
    const ex: HighlightInTextContent = {
      ...exercise({ text }),
      questions: [question('q', { spans: [spanAt(text, 'var', 1, 's')] })],
    };
    const next = reanchor(ex, 'Det varm kaldt.');
    expect(next.orphans.map((o) => o.surface)).toEqual(['var']);
  });

  it('keeps spans sorted by position after the pass', () => {
    const ex = exercise();
    const next = reanchor(ex, ex.text.replace('I fjor sommer reiste vi til Lofoten. ', '') + ' Vi reiste.');
    const starts = next.questions[0]!.spans.map((s) => s.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('previewReanchor', () => {
  it('AC-R5: reports exactly the orphans applying would produce, and changes nothing', () => {
    const ex = exercise();
    const edited = ex.text.replace('Naboen vår fortalte at han hadde fisket i det samme vannet i førti år. ', '');
    const before = JSON.stringify(ex);
    const { lost } = previewReanchor(ex, edited);
    expect(lost).toBe(reanchor(ex, edited).orphans.length);
    expect(lost).toBe(2);
    expect(JSON.stringify(ex)).toBe(before);
  });

  it('counts only new orphans, not those already waiting', () => {
    const ex = { ...exercise(), orphans: [{ id: 'o', qid: 'q1', surface: 'x', why: '' }] };
    expect(previewReanchor(ex, ex.text).lost).toBe(0);
  });
});

describe('putBack / dropOrphan', () => {
  const orphaned = () =>
    reanchor(exercise(), SAMPLE_TEXT.replace('Naboen vår fortalte at han hadde fisket i det samme vannet i førti år. ', ''));

  it('AC-R4: puts an orphan back on the first occurrence of its words, with its explanation', () => {
    const ex = orphaned();
    const text = ex.text + ' Han fortalte mye.';
    const withWord = { ...ex, text };
    expect(canPutBack(withWord, withWord.orphans.find((o) => o.id === 'fortalte')!)).toBe(true);
    const next = putBack(withWord, 'fortalte');
    expect(next.orphans.map((o) => o.id)).not.toContain('fortalte');
    const span = next.questions[0]!.spans.find((s) => s.id === 'fortalte')!;
    expect(text.slice(span.start, span.end)).toBe('fortalte');
    expect(span.why).toBe('fortalte — why');
  });

  it('offers nothing when the words are gone, and leaves the document as it was', () => {
    const ex = orphaned();
    const orphan = ex.orphans.find((o) => o.id === 'fortalte')!;
    expect(canPutBack(ex, orphan)).toBe(false);
    expect(putBack(ex, 'fortalte')).toBe(ex);
  });

  it('drops an orphan', () => {
    const ex = orphaned();
    expect(dropOrphan(ex, 'fortalte').orphans.map((o) => o.id)).toEqual(['i førti år']);
  });

  it('the fixture settings are the defaults — nothing here depends on them', () => {
    expect(exercise().settings).toEqual(settings());
  });
});
