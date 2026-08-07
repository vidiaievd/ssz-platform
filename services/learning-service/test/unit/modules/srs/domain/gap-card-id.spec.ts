import {
  gapCardContentId,
  parseGapCardContentId,
} from '../../../../../src/modules/srs/domain/gap-card-id.js';

const EXERCISE_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';

describe('gap card contentId', () => {
  it('round-trips an exercise and a gap key', () => {
    const id = gapCardContentId(EXERCISE_ID, 'gap-3');
    expect(id).toBe(`${EXERCISE_ID}#gap-3`);
    expect(parseGapCardContentId(id)).toEqual({ exerciseId: EXERCISE_ID, gapKey: 'gap-3' });
  });

  it('keeps a gap key that contains a separator whole', () => {
    // gapKey is author-supplied, so it is the half that might carry a '#'. Splitting
    // on the last separator instead would silently move part of it into the id.
    const id = gapCardContentId(EXERCISE_ID, 'gap#3');
    expect(parseGapCardContentId(id)).toEqual({ exerciseId: EXERCISE_ID, gapKey: 'gap#3' });
  });

  it('rejects ids that are not gap cards', () => {
    // An EXERCISE card's contentId is a bare UUID. Reading one as a gap card would
    // hand back an empty gapKey rather than saying it is the wrong kind of card.
    expect(parseGapCardContentId(EXERCISE_ID)).toBeNull();
    expect(parseGapCardContentId(`#gap-3`)).toBeNull();
    expect(parseGapCardContentId(`${EXERCISE_ID}#`)).toBeNull();
    expect(parseGapCardContentId('')).toBeNull();
  });
});
