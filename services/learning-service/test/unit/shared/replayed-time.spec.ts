import {
  REPLAYED_TIME_MAX_AGE_MS,
  boundReplayedTime,
} from '../../../src/shared/domain/replayed-time.js';

// VoxOrd offline plan, B4: work done on a phone with no network is recorded at the time it
// was done, as far as the phone's clock can be believed.

const now = new Date('2026-10-16T12:00:00.000Z');
const before = (ms: number) => new Date(now.getTime() - ms);
const HOUR = 60 * 60 * 1000;

describe('boundReplayedTime', () => {
  it('no time given is now', () => {
    expect(boundReplayedTime(undefined, now)).toEqual(now);
  });

  it('a time in the past is taken as it stands', () => {
    expect(boundReplayedTime(before(30 * HOUR), now)).toEqual(before(30 * HOUR));
  });

  it('a time in the future is now', () => {
    expect(boundReplayedTime(new Date(now.getTime() + HOUR), now)).toEqual(now);
  });

  it('a time older than seven days is now', () => {
    expect(boundReplayedTime(before(REPLAYED_TIME_MAX_AGE_MS + 1), now)).toEqual(now);
  });

  it('a time exactly seven days back is still believed', () => {
    expect(boundReplayedTime(before(REPLAYED_TIME_MAX_AGE_MS), now)).toEqual(
      before(REPLAYED_TIME_MAX_AGE_MS),
    );
  });

  it('a time before the floor is the floor', () => {
    expect(boundReplayedTime(before(48 * HOUR), now, before(24 * HOUR))).toEqual(before(24 * HOUR));
  });

  it('now before a floor in the future stays at the floor, so a card never goes back', () => {
    expect(boundReplayedTime(undefined, now, new Date(now.getTime() + HOUR))).toEqual(
      new Date(now.getTime() + HOUR),
    );
  });

  it('an unreadable time is now', () => {
    expect(boundReplayedTime(new Date('nonsense'), now)).toEqual(now);
  });
});
