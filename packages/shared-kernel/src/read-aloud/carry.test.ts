// Carrying passed prompts into the next try (plan 70, phase 11b).

import { describe, expect, it } from 'vitest';

import type { ReturnedTry } from './carry.js';
import {
  carriedFrom,
  carriedPrompts,
  freshPart,
  marksWithCarried,
  scoreSubmission,
  withCarried,
} from './carry.js';
import { sampleDocument, SAMPLE_PROMPT_IDS } from './fixture.js';
import { markKey, snapshotOf } from './rubric.js';
import { readSubmission } from './submission.js';

const [P1, P2] = SAMPLE_PROMPT_IDS;
const IDS = [P1, P2];
const snapshot = snapshotOf(sampleDocument());

/** Weights 2/1/2, max 15, pass 9 (RA-M4). */
function levels(itemId: string, [pron, flow, content]: [number, number, number]) {
  return {
    [markKey(itemId, 'pron')]: pron,
    [markKey(itemId, 'flow')]: flow,
    [markKey(itemId, 'content')]: content,
  };
}

/** A first try returned with P1 failed (5/15) and P2 passed (13/15). */
function returned(over: Partial<ReturnedTry> = {}): ReturnedTry {
  return {
    id: 'try-1',
    revisionCount: 0,
    submittedAnswer: {
      recordings: [
        { itemId: P1, assetId: 'a1', seconds: 20, takes: 2 },
        { itemId: P2, assetId: 'a2', seconds: 25, takes: 1 },
      ],
    },
    reviewDecisions: [
      { itemId: P1, approved: false, comment: 'Slow down on the vowels.' },
      { itemId: P2, approved: true, comment: ' Fine. ' },
    ],
    rubricMarks: { ...levels(P1, [1, 1, 1]), ...levels(P2, [3, 1, 3]) },
    rubricSnapshot: snapshot,
    ...over,
  };
}

describe('carriedFrom', () => {
  it('carries the passed prompt with its recording, marks, points and comment', () => {
    const carried = carriedFrom(returned(), IDS);

    expect(carried).toEqual([
      {
        itemId: P2,
        assetId: 'a2',
        seconds: 25,
        takes: 1,
        carried: {
          attemptId: 'try-1',
          attempt: 1,
          marks: { pron: 3, flow: 1, content: 3 },
          points: 13,
          max: 15,
          comment: 'Fine.',
        },
      },
    ]);
    expect(carriedPrompts(carried)).toEqual([{ itemId: P2, attempt: 1 }]);
  });

  it('keeps the try a prompt was first passed in across a second return', () => {
    const second = carriedFrom(returned(), IDS);
    const third = carriedFrom(
      returned({
        id: 'try-2',
        revisionCount: 1,
        submittedAnswer: { recordings: [{ itemId: P1, assetId: 'b1', seconds: 21, takes: 1 }, ...second] },
        reviewDecisions: [
          { itemId: P1, approved: false, comment: 'Still slow.' },
          { itemId: P2, approved: true, comment: 'Fine.' },
        ],
      }),
      IDS,
    );

    expect(third).toHaveLength(1);
    expect(third[0]!.carried).toMatchObject({ attemptId: 'try-1', attempt: 1, points: 13 });
  });

  it('carries nothing the exercise no longer has, and nothing that was not ruled on', () => {
    expect(carriedFrom(returned(), [P1])).toEqual([]);
    expect(carriedFrom(returned({ reviewDecisions: null }), IDS)).toEqual([]);
    expect(carriedFrom(returned({ submittedAnswer: { text: 'hei' } }), IDS)).toEqual([]);
  });
});

describe('the submission with carried prompts', () => {
  const carried = carriedFrom(returned(), IDS);

  it('drops what a client sent for a carried prompt and any carried flag it wrote', () => {
    const fresh = freshPart(
      {
        recordings: [
          { itemId: P1, assetId: 'n1', seconds: 20, takes: 1, carried: carried[0]!.carried! },
          { itemId: P2, assetId: 'n2', seconds: 20, takes: 1 },
        ],
      },
      carried,
    );

    expect(fresh).toEqual({ recordings: [{ itemId: P1, assetId: 'n1', seconds: 20, takes: 1 }] });
  });

  it('puts the carried recordings back in the exercise order and survives the column', () => {
    const whole = withCarried({ recordings: [{ itemId: P1, assetId: 'n1', seconds: 20, takes: 1 }] }, carried, [
      P2,
      P1,
    ]);

    expect(whole.recordings.map((r) => r.itemId)).toEqual([P2, P1]);
    expect(readSubmission(JSON.parse(JSON.stringify(whole)))).toEqual(whole);
  });

  it('a malformed carried ruling off a column reads as a new prompt', () => {
    const read = readSubmission({
      recordings: [{ itemId: P2, assetId: 'a2', seconds: 25, takes: 1, carried: { attempt: 'one' } }],
    });
    expect(read?.recordings[0]).not.toHaveProperty('carried');
  });
});

describe('scoreSubmission', () => {
  const carried = carriedFrom(returned(), IDS);
  const whole = withCarried({ recordings: [{ itemId: P1, assetId: 'n1', seconds: 20, takes: 1 }] }, carried, IDS);

  it('asks for marks on the new prompt only, and takes the carried one as passed', () => {
    const unmarked = scoreSubmission(snapshot, {}, whole.recordings);
    expect(unmarked.complete).toBe(false);
    expect(unmarked.missing).toEqual([markKey(P1, 'pron'), markKey(P1, 'flow'), markKey(P1, 'content')]);

    const scored = scoreSubmission(snapshot, levels(P1, [2, 2, 2]), whole.recordings);
    expect(scored.complete).toBe(true);
    expect(scored.passed).toBe(true);
    expect(scored.points).toBe(10 + 13);
    expect(scored.max).toBe(30);
    expect(scored.prompts[1]).toMatchObject({ itemId: P2, outcome: { passed: true }, carried: { attempt: 1 } });
  });

  it('a mark a client sent for a carried prompt changes nothing', () => {
    const scored = scoreSubmission(snapshot, { ...levels(P1, [2, 2, 2]), ...levels(P2, [0, 0, 0]) }, whole.recordings);
    expect(scored.prompts[1]!.outcome.points).toBe(13);
    expect(scored.passed).toBe(true);
  });

  it('fails when the new prompt fails, whatever was carried', () => {
    const scored = scoreSubmission(snapshot, levels(P1, [1, 1, 1]), whole.recordings);
    expect(scored.passed).toBe(false);
    expect(scored.passedCount).toBe(1);
  });

  it('is never re-scored against a rubric that changed since the pass', () => {
    const stricter = { ...snapshot, passScore: 14 };
    const scored = scoreSubmission(stricter, levels(P1, [3, 2, 3]), whole.recordings);
    expect(scored.prompts[1]!.outcome).toMatchObject({ points: 13, passed: true });
  });

  it('a submission of carried prompts only is complete with nothing to mark', () => {
    const scored = scoreSubmission(snapshot, {}, carried);
    expect(scored).toMatchObject({ complete: true, passed: true, missing: [] });
  });

  it('stores the frozen marks beside the teacher’s', () => {
    const marks = marksWithCarried({ ...levels(P1, [2, 2, 2]), ...levels(P2, [0, 0, 0]) }, whole.recordings);
    expect(marks).toEqual({ ...levels(P1, [2, 2, 2]), ...levels(P2, [3, 1, 3]) });
  });
});
