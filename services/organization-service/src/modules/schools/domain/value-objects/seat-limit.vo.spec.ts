import { studentSeatLimitOf } from './seat-limit.vo.js';

describe('studentSeatLimitOf', () => {
  it('reads max while the key is on', () => {
    expect(studentSeatLimitOf({ 'seats.students': { enabled: true, limits: { max: 30 } } })).toBe(30);
  });

  it('has no limit without the key, with it off, or without a usable max', () => {
    expect(studentSeatLimitOf({})).toBeNull();
    expect(studentSeatLimitOf(undefined)).toBeNull();
    expect(studentSeatLimitOf({ 'seats.students': { enabled: false, limits: { max: 30 } } })).toBeNull();
    expect(studentSeatLimitOf({ 'seats.students': { enabled: true, limits: {} } })).toBeNull();
    expect(studentSeatLimitOf({ 'seats.students': { enabled: true, limits: { max: '30' } } })).toBeNull();
  });

  it('keeps 0 as a limit', () => {
    expect(studentSeatLimitOf({ 'seats.students': { enabled: true, limits: { max: 0 } } })).toBe(0);
  });
});
