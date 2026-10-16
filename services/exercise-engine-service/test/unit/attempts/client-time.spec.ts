import {
  CLIENT_TIME_MAX_AGE_MS,
  resolveClientTime,
} from '../../../src/shared/application/services/client-time.js';

// VoxOrd offline plan, B4: a call replayed from the phone's journal is recorded at the time
// it was made, as far as the server can believe the phone's clock.

const serverNow = new Date('2026-10-16T12:00:00.000Z');
const minutes = (n: number) => n * 60 * 1000;
const before = (ms: number) => new Date(serverNow.getTime() - ms);

describe('resolveClientTime', () => {
  it('an online call, with no claim, is recorded at the server time', () => {
    expect(resolveClientTime(null, serverNow, null)).toEqual(serverNow);
  });

  it('a claim from a clock that is right is taken as it stands', () => {
    const at = before(minutes(90));
    expect(resolveClientTime({ at, sentAt: serverNow }, serverNow, null)).toEqual(at);
  });

  it('a clock that is wrong by a constant amount is corrected by the skew', () => {
    // The phone is an hour ahead: it answered 90 minutes ago, its clock reading 30 minutes
    // ago, and sent now, its clock reading an hour from now.
    const at = before(minutes(30));
    const sentAt = new Date(serverNow.getTime() + minutes(60));
    expect(resolveClientTime({ at, sentAt }, serverNow, null)).toEqual(before(minutes(90)));
  });

  it('a claim with no send time is taken without correction', () => {
    const at = before(minutes(5));
    expect(resolveClientTime({ at, sentAt: null }, serverNow, null)).toEqual(at);
  });

  it('a call is never recorded in the future', () => {
    const at = new Date(serverNow.getTime() + minutes(10));
    expect(resolveClientTime({ at, sentAt: null }, serverNow, null)).toEqual(serverNow);
  });

  it('a call is never recorded before the last moment on its attempt', () => {
    const floor = before(minutes(20));
    const at = before(minutes(40));
    expect(resolveClientTime({ at, sentAt: serverNow }, serverNow, floor)).toEqual(floor);
  });

  it('a claim older than the refresh token can live is the server time', () => {
    const at = before(CLIENT_TIME_MAX_AGE_MS + minutes(1));
    expect(resolveClientTime({ at, sentAt: serverNow }, serverNow, null)).toEqual(serverNow);
  });

  it('a claim exactly at the age limit is still believed', () => {
    const at = before(CLIENT_TIME_MAX_AGE_MS);
    expect(resolveClientTime({ at, sentAt: serverNow }, serverNow, null)).toEqual(at);
  });

  it('an unreadable claim is the server time', () => {
    const at = new Date('nonsense');
    expect(resolveClientTime({ at, sentAt: serverNow }, serverNow, null)).toEqual(serverNow);
  });
});
