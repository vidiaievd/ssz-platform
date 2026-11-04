import { emptyProsodyLayer } from '@ssz/shared-kernel/prosody';
import { tokenize } from '@ssz/shared-kernel/text';
import {
  sampleDocument,
  setGuide,
  toContent,
  toExpectedAnswers,
  type ReadAloudContent,
} from '@ssz/shared-kernel/read-aloud';
import { readAloudViolations } from './read-aloud-preflight.js';

// What earns this file: the listening note of a prompt is a blocker when empty, and the note is in
// the column only this query loads beside the content.

function exercise(doc: ReadAloudContent = sampleDocument(), audio = true) {
  return {
    id: 'ex-1',
    content: { ...toContent(doc), audio: { enabled: audio } },
    expectedAnswers: toExpectedAnswers(doc),
  };
}

const codesOf = (doc: ReadAloudContent, audio = true) =>
  readAloudViolations(exercise(doc, audio)).map((v) => [v.ruleCode, v.severity]);

describe('readAloudViolations', () => {
  it('passes the finished sample with its model reading', () => {
    expect(readAloudViolations(exercise())).toEqual([]);
  });

  it('warns about a passage with no model reading, reading the layer flag off the content', () => {
    expect(codesOf(sampleDocument(), false)).toEqual([['READALOUD_RA_NO_MODEL', 'warning']]);
  });

  it('blocks a prompt with no listening note, reading the note from the key column', () => {
    const doc = sampleDocument();
    doc.prompts[1] = { ...doc.prompts[1], note: '' };
    const violations = readAloudViolations(exercise(doc));
    expect(violations).toEqual([
      {
        ruleCode: 'READALOUD_RA_NO_NOTE',
        severity: 'blocker',
        itemType: 'EXERCISE',
        itemId: 'ex-1',
        detail: '1 prompt has no listening note, so the grader is not told what to listen for',
      },
    ]);
  });

  it('reports one violation per code, not per prompt', () => {
    const doc = sampleDocument();
    doc.prompts = doc.prompts.map((p) => ({ ...p, note: '' }));
    const violations = readAloudViolations(exercise(doc));
    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('2 prompts have');
  });

  it('blocks a range nothing can be submitted in and one past the 180 s ceiling', () => {
    const doc = sampleDocument();
    doc.prompts[0] = { ...doc.prompts[0], minSeconds: 60, maxSeconds: 60 };
    doc.prompts[1] = { ...doc.prompts[1], maxSeconds: 400 };
    const codes = codesOf(doc);
    expect(codes).toContainEqual(['READALOUD_RA_RANGE_INVALID', 'blocker']);
    expect(codes).toContainEqual(['READALOUD_RA_OVER_CEILING', 'blocker']);
  });

  it('blocks an empty rubric and a pass mark above its maximum', () => {
    const doc = sampleDocument();
    expect(codesOf({ ...doc, rubric: [] })).toContainEqual([
      'READALOUD_RA_RUBRIC_EMPTY',
      'blocker',
    ]);
    expect(codesOf({ ...doc, settings: { ...doc.settings, passScore: 99 } })).toContainEqual([
      'READALOUD_RA_PASS_ABOVE_MAX',
      'blocker',
    ]);
  });

  it('drops info: one take and no microphone check do not reach a container report', () => {
    const doc = sampleDocument();
    const quiet = {
      ...doc,
      recording: { ...doc.recording, takes: 1, chooseBest: true, micCheck: false },
    };
    expect(readAloudViolations(exercise(quiet))).toEqual([]);
  });

  // Plan 86, step 6h.2c: the pronunciation guide, judged from the layers and lexicon words beside it.
  describe('with the pronunciation guide on', () => {
    const guided = () => setGuide(sampleDocument(), { enabled: true });

    it('blocks a word the lexicon left open until the author answers it', () => {
      const doc = guided();
      const first = doc.prompts[0]!;
      const word = tokenize(first.text)[0]!;
      const open = {
        [first.id]: { layer: emptyProsodyLayer(), unresolved: [{ i: word.i, w: word.w }] },
      };
      expect(readAloudViolations(exercise(doc), open)).toEqual([
        expect.objectContaining({
          ruleCode: 'READALOUD_RA_GUIDE_WORD_UNCONFIRMED',
          severity: 'blocker',
        }),
      ]);

      const answered = {
        [first.id]: {
          layer: {
            ...emptyProsodyLayer(),
            unstressed: [{ i: word.i, w: word.w, source: 'teacher' as const }],
          },
          unresolved: [{ i: word.i, w: word.w }],
        },
      };
      expect(readAloudViolations(exercise(doc), answered)).toEqual([]);
    });

    it('asks nothing beside the document when the caller could not read the guide', () => {
      expect(readAloudViolations(exercise(guided()))).toEqual([]);
    });
  });
});
