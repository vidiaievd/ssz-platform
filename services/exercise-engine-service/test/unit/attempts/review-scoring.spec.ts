import { ReviewScoring } from '../../../src/modules/attempts/application/services/review-scoring.js';
import { isMachineClean } from '../../../src/modules/attempts/application/services/review-scoring.js';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';

// `scoreOf` is arithmetic over what it is handed — the ports are only used by
// `autoOutcomes`, which these cases never reach.
const scoring = new ReviewScoring(null as never, null as never);

const rubric: RubricSnapshot = {
  criteria: [
    { id: 'task', name: 'Oppgaveløsning', desc: '', weight: 2, levels: ['', '', '', ''] },
    { id: 'struct', name: 'Struktur', desc: '', weight: 1, levels: ['', '', '', ''] },
    { id: 'lang', name: 'Språk', desc: '', weight: 1, levels: ['', '', '', ''] },
    { id: 'lexis', name: 'Ordforråd', desc: '', weight: 1, levels: ['', '', '', ''] },
  ],
  passScore: 8,
};

describe('ReviewScoring.scoreOf — items', () => {
  it('scores the proportion the machine and the teacher between them approved', () => {
    const auto = [
      { itemId: 'i1', autoPassed: true },
      { itemId: 'i2', autoPassed: false },
      { itemId: 'i3', autoPassed: false },
      { itemId: 'i4', autoPassed: false },
    ];

    const score = scoring.scoreOf(auto, [
      { itemId: 'i2', approved: true },
      { itemId: 'i3', approved: false },
    ]);

    expect(score).toEqual({ approvedItems: 2, totalItems: 4, score: 50, rubric: null });
  });

  it('scores a submission with no readable items on the teacher approving it', () => {
    expect(scoring.scoreOf([], [])).toEqual({
      approvedItems: 0,
      totalItems: 0,
      score: 100,
      rubric: null,
    });
  });
});

describe('ReviewScoring.scoreOf — rubric', () => {
  it('reports the rubric total in points and the same total as a percentage', () => {
    const score = scoring.scoreOf([], [], {
      snapshot: rubric,
      marks: { task: 3, struct: 2, lang: 2, lexis: 1 },
    });

    // 11 of 15 — what the graded card says — and 73%, what the SRS reads.
    expect(score.approvedItems).toBe(11);
    expect(score.totalItems).toBe(15);
    expect(score.score).toBe(73);
    expect(score.rubric?.passed).toBe(true);
  });

  it('keeps a pass off the SRS failure threshold when the rubric says it passed', () => {
    const score = scoring.scoreOf([], [], {
      snapshot: rubric,
      marks: { task: 2, struct: 2, lang: 1, lexis: 1 },
    });

    // 8 of 15 clears passScore in points and is 53% — the two units disagree by design,
    // and only the points decide the verdict.
    expect(score.rubric?.points).toBe(8);
    expect(score.rubric?.passed).toBe(true);
    expect(score.score).toBe(53);
  });

  it('ignores the items branch entirely when a rubric is given', () => {
    const auto = [
      { itemId: 'i1', autoPassed: true },
      { itemId: 'i2', autoPassed: true },
    ];

    const score = scoring.scoreOf(auto, [], {
      snapshot: rubric,
      marks: { task: 0, struct: 0, lang: 0, lexis: 0 },
    });

    expect(score.score).toBe(0);
    expect(score.totalItems).toBe(15);
  });

  it('reports an unmarked criterion rather than scoring it', () => {
    const score = scoring.scoreOf([], [], { snapshot: rubric, marks: { task: 3 } });

    expect(score.rubric?.complete).toBe(false);
    expect(score.rubric?.missing).toEqual(['struct', 'lang', 'lexis']);
  });
});

describe('isMachineClean', () => {
  it('is false for a submission the machine reported nothing about', () => {
    // `writing_task`: no items by design, so a batch must never sweep it through.
    expect(isMachineClean([])).toBe(false);
  });

  it('is true only when every reported item passed', () => {
    expect(isMachineClean([{ itemId: 'i1', autoPassed: true }])).toBe(true);
    expect(
      isMachineClean([
        { itemId: 'i1', autoPassed: true },
        { itemId: 'i2', autoPassed: false },
      ]),
    ).toBe(false);
  });
});
