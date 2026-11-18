import { summarizeSweepReport } from '../../../../src/modules/sweeps/domain/sweep-run.js';

describe('summarizeSweepReport (plan 90, phase 8)', () => {
  it('reads orphans as the candidates of a recording or content sweep', () => {
    const report = { mode: 'dry-run', scanned: 10, inUse: 7, orphans: 3, deleted: 0, aborted: false, skipped: false };

    expect(summarizeSweepReport('orphan_recordings', report)).toEqual({
      scanned: 10,
      kept: 7,
      candidates: 3,
      deleted: 0,
      aborted: false,
      skipped: false,
    });
    expect(summarizeSweepReport('orphan_content', report)?.candidates).toBe(3);
  });

  it('reads unused as the candidates of the replaced-narration sweep', () => {
    const report = { mode: 'delete', scanned: 5, inUse: 1, unused: 4, deleted: 4, aborted: false, skipped: false };

    expect(summarizeSweepReport('superseded_narrations', report)).toMatchObject({ kept: 1, candidates: 4, deleted: 4 });
  });

  it('counts every abandoned upload as a candidate, none kept', () => {
    const report = { mode: 'delete', scanned: 6, deleted: 5, skipped: false };

    expect(summarizeSweepReport('abandoned_uploads', report)).toEqual({
      scanned: 6,
      kept: 0,
      candidates: 6,
      deleted: 5,
      aborted: false,
      skipped: false,
    });
  });

  it('carries the stop and the skip', () => {
    expect(summarizeSweepReport('orphan_recordings', { aborted: true })).toMatchObject({ aborted: true, scanned: 0 });
    expect(summarizeSweepReport('orphan_content', { skipped: true })).toMatchObject({ skipped: true });
  });

  it('has nothing to say about a run without a report', () => {
    expect(summarizeSweepReport('orphan_recordings', null)).toBeNull();
  });

  it('ignores what is not a number', () => {
    expect(summarizeSweepReport('orphan_recordings', { scanned: '4', orphans: null })).toMatchObject({
      scanned: 0,
      candidates: 0,
    });
  });
});
