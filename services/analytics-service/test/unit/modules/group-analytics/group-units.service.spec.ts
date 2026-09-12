import { jest } from '@jest/globals';

// Same reason as the sibling suites: importing the service pulls in `PrismaService`, and
// with it the generated client, whose `import.meta` brings the run down under jest.
jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GroupUnitsService, qualityOf, weighAttempt } = await import(
  '../../../../src/modules/group-analytics/group-units.service.js'
);

const UNITS = [
  { unitId: 'u1', no: 1, title: 'Leksjon 17', itemIds: ['i1', 'i2', 'i3', 'i4'], items: 4 },
];

function serviceWith(prisma: unknown, delivery: unknown = null) {
  const outline = { ensureFresh: async () => undefined };
  const scheduling = { getGroupDelivery: async () => delivery };
  return new GroupUnitsService(prisma as never, outline as never, scheduling as never);
}

describe('absorbedByUnit', () => {
  const rows = [
    { userId: 'anna', contentId: 'i1', status: 'COMPLETED' },
    { userId: 'anna', contentId: 'i2', status: 'COMPLETED' },
    { userId: 'anna', contentId: 'i3', status: 'NEEDS_REVIEW' },
    { userId: 'bjorn', contentId: 'i1', status: 'IN_PROGRESS' },
    { userId: 'cecilie', contentId: 'i1', status: 'NOT_STARTED' },
  ];

  const service = serviceWith({ itemProgress: { findMany: async () => rows } });

  it('counts COMPLETED only — work sitting with a teacher is not taken away yet', async () => {
    const byUnit = await service.absorbedByUnit(['anna', 'bjorn', 'cecilie', 'dag'], UNITS);
    expect(byUnit.get('u1')?.get('anna')).toEqual({ passed: 2, touched: true });
  });

  it('separates "started and passed nothing" from "never opened it"', async () => {
    const byUnit = await service.absorbedByUnit(['anna', 'bjorn', 'cecilie', 'dag'], UNITS);
    const learners = byUnit.get('u1');

    expect(learners?.get('bjorn')).toEqual({ passed: 0, touched: true });
    // A card the service created is not a unit the learner opened.
    expect(learners?.get('cecilie')?.touched).toBe(false);
    // Nothing at all: absent from the map, never present at zero.
    expect(learners?.has('dag')).toBe(false);
  });

  it('asks for nothing when there is no roster or no course', async () => {
    const findMany = jest.fn();
    const empty = serviceWith({ itemProgress: { findMany } });

    expect((await empty.absorbedByUnit([], UNITS)).get('u1')?.size).toBe(0);
    expect((await empty.absorbedByUnit(['anna'], [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('evidenceByUnit', () => {
  /** Typed from memory: a success proves everything, so it weighs 1. */
  const typed = {
    userId: 'anna',
    exerciseId: 'i1',
    ratingApplied: 'GOOD',
    answerMode: 'free',
    bankSize: null,
    wordsConsumed: false,
    templateCode: 'gap_fill',
    gapPosition: null,
  };

  it('weighs attempts on the profile’s scale, not by the head', async () => {
    const service = serviceWith({
      attemptEvidence: {
        findMany: async () => [
          { ...typed, passed: true },
          // Picked out of two: a success here proves much less than the typed one above.
          {
            ...typed,
            passed: true,
            answerMode: 'bank',
            bankSize: 2,
            templateCode: 'wordbank_gapfill',
          },
        ],
      },
    });

    const unit = (await service.evidenceByUnit(['anna'], UNITS)).get('u1');
    expect(unit?.attempts).toBe(2);
    // Both succeeded, so all of the weight is success weight — the rate is 1 either way,
    // but the samples differ, which is what the confidence threshold reads.
    expect(qualityOf(unit as never)).toBe(1);
    expect(unit?.weightedSample).toBeLessThan(2);
    expect(unit?.weightedSample).toBeGreaterThan(1);
  });

  it('answers null quality for a unit nobody attempted — never a zero', async () => {
    const service = serviceWith({ attemptEvidence: { findMany: async () => [] } });
    const unit = (await service.evidenceByUnit(['anna'], UNITS)).get('u1');

    expect(unit?.attempts).toBe(0);
    expect(qualityOf(unit as never)).toBeNull();
  });

  it('ignores attempts on items outside the unit’s course', async () => {
    const service = serviceWith({
      attemptEvidence: {
        findMany: async () => [{ ...typed, passed: true, exerciseId: 'somewhere-else' }],
      },
    });

    expect((await service.evidenceByUnit(['anna'], UNITS)).get('u1')?.attempts).toBe(0);
  });
});

describe('weighAttempt', () => {
  const base = {
    answerMode: null,
    bankSize: null,
    wordsConsumed: null,
    templateCode: null,
    gapPosition: null,
  };

  it('reads the exercise’s own verdict when it has one', () => {
    // The rating says the card came back; the exercise says the answer was wrong. The
    // screen's axis is named after the exercise, so the exercise wins.
    expect(weighAttempt({ ...base, passed: false, ratingApplied: 'GOOD' }).succeeded).toBe(false);
  });

  it('falls back to the rating for rows written before `passed` existed', () => {
    expect(weighAttempt({ ...base, passed: null, ratingApplied: 'AGAIN' }).succeeded).toBe(false);
    expect(weighAttempt({ ...base, passed: null, ratingApplied: 'EASY' }).succeeded).toBe(true);
  });
});
