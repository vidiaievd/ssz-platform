import { jest } from '@jest/globals';
import { GetLearnerSoundAtomsHandler } from '../../../../../src/modules/srs/application/queries/get-learner-sound-atoms.handler.js';
import { GetLearnerSoundAtomsQuery } from '../../../../../src/modules/srs/application/queries/get-learner-sound-atoms.query.js';
import type { ISrsRepository } from '../../../../../src/modules/srs/domain/repositories/srs-repository.interface.js';
import type { AtomFlagDay, IAtomFlagLog } from '../../../../../src/modules/srs/domain/repositories/atom-flag-log.interface.js';

const USER = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const NOW = new Date('2026-11-07T15:00:00Z');

interface CardFixture {
  contentId: string;
  state?: string;
  dueAt: string;
  stability?: number;
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function makeHandler(cards: CardFixture[], flags: AtomFlagDay[]) {
  const srsRepo = {
    findAllByUserAndTypeIncludingShadow: jest.fn(async () =>
      cards.map((c) => ({
        contentId: c.contentId,
        state: c.state ?? 'REVIEW',
        dueAt: new Date(c.dueAt),
        stability: c.stability ?? 3,
        reps: 2,
        lapses: 0,
        lastReviewedAt: null,
      })),
    ),
  } as unknown as ISrsRepository;
  const flagLog = {
    record: jest.fn(),
    flaggedDays: jest.fn(),
    recentFlags: jest.fn(async () => flags),
  } as unknown as IAtomFlagLog;
  const handler = new GetLearnerSoundAtomsHandler(srsRepo, flagLog, { now: () => NOW });
  return { handler, srsRepo, flagLog };
}

describe('GetLearnerSoundAtomsHandler', () => {
  it('reads SOUND_ATOM cards and a fortnight of sound flags of the language', async () => {
    const { handler, srsRepo, flagLog } = makeHandler([], []);
    const result = await handler.execute(new GetLearnerSoundAtomsQuery(USER, 'nb'));

    expect(srsRepo.findAllByUserAndTypeIncludingShadow).toHaveBeenCalledWith(USER, 'SOUND_ATOM');
    // 14 UTC days counting today: 25.10 … 07.11.
    expect(flagLog.recentFlags).toHaveBeenCalledWith(USER, 'sound', 'nb:', day('2026-10-25'));
    expect(result).toEqual({ cards: [], flags: [], flagsFrom: '2026-10-25' });
  });

  it('orders cards due first, then by due date, then by lower stability; keeps one language', async () => {
    const { handler } = makeHandler(
      [
        { contentId: 'nb:y', dueAt: '2026-11-10T00:00:00Z' },
        { contentId: 'nb:kj', dueAt: '2026-11-06T00:00:00Z' },
        { contentId: 'nb:sj', dueAt: '2026-11-06T00:00:00Z', stability: 1 },
        { contentId: 'sv:sj', dueAt: '2026-11-01T00:00:00Z' },
      ],
      [],
    );
    const { cards } = await handler.execute(new GetLearnerSoundAtomsQuery(USER, 'nb'));

    expect(cards.map((c) => [c.atomId, c.due])).toEqual([
      ['nb:sj', true],
      ['nb:kj', true],
      ['nb:y', false],
    ]);
  });

  it('folds flags per atom: distinct days, last day, per source, whether a card exists', async () => {
    const { handler } = makeHandler(
      [{ contentId: 'nb:kj', dueAt: '2026-11-20T00:00:00Z' }],
      [
        { atomId: 'nb:kj', source: 'ai_voice', flaggedOn: day('2026-11-01') },
        { atomId: 'nb:tone', source: 'ai_voice', flaggedOn: day('2026-11-05') },
        { atomId: 'nb:kj', source: 'ai_precheck', flaggedOn: day('2026-11-01') },
        { atomId: 'nb:kj', source: 'ai_voice', flaggedOn: day('2026-11-03') },
      ],
    );
    const { flags } = await handler.execute(new GetLearnerSoundAtomsQuery(USER, 'nb'));

    expect(flags).toEqual([
      {
        atomId: 'nb:kj',
        days: 2,
        lastFlaggedOn: '2026-11-03',
        bySource: { ai_voice: 2, ai_precheck: 1 },
        hasCard: true,
      },
      { atomId: 'nb:tone', days: 1, lastFlaggedOn: '2026-11-05', bySource: { ai_voice: 1 }, hasCard: false },
    ]);
  });

  it('hides a suspended sound from both lists', async () => {
    const { handler } = makeHandler(
      [{ contentId: 'nb:r', state: 'SUSPENDED', dueAt: '2026-11-01T00:00:00Z' }],
      [{ atomId: 'nb:r', source: 'ai_voice', flaggedOn: day('2026-11-06') }],
    );
    const result = await handler.execute(new GetLearnerSoundAtomsQuery(USER, 'nb'));

    expect(result.cards).toEqual([]);
    expect(result.flags).toEqual([]);
  });
});
