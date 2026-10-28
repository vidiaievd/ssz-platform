import { costMicros, speechCostMicros } from './cost.js';

const price = (input: string, output: string, cacheRead = '0', cacheWrite = '0', audioPerHour = '0') => ({
  effectiveFrom: new Date(),
  inputPerMtok: input,
  outputPerMtok: output,
  cacheReadPerMtok: cacheRead,
  cacheWritePerMtok: cacheWrite,
  audioPerHour,
  currency: 'USD',
});

const audio = (perHour: string) => price('0', '0', '0', '0', perHour);

describe('costMicros', () => {
  it('is tokens × price per 1M, in micro-units', () => {
    // 1000 × $2/M + 500 × $10/M = $0.002 + $0.005 = 7000 micro-USD
    expect(costMicros({ input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }, price('2', '10'))).toBe(7000);
  });

  it('prices cache reads and writes separately', () => {
    // 10×2 + 7×10 + 900×0.2 + 50×2.5 = 20 + 70 + 180 + 125
    expect(
      costMicros({ input: 10, output: 7, cacheRead: 900, cacheWrite: 50 }, price('2', '10', '0.2', '2.5')),
    ).toBe(395);
  });

  it('rounds half up and stays exact where floats would drift', () => {
    expect(costMicros({ input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }, price('0.5', '0'))).toBe(1);
    expect(costMicros({ input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }, price('0.499999', '0'))).toBe(0);
    expect(costMicros({ input: 3, output: 0, cacheRead: 0, cacheWrite: 0 }, price('0.1', '0'))).toBe(0);
    expect(costMicros({ input: 10_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, price('0.1', '0'))).toBe(1_000_000);
  });

  it('is zero for a free model', () => {
    expect(costMicros({ input: 5000, output: 5000, cacheRead: 5, cacheWrite: 5 }, price('0', '0'))).toBe(0);
  });

  it('refuses a malformed price instead of guessing', () => {
    expect(() => costMicros({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, price('-1', '0'))).toThrow('Not a price');
    expect(() => costMicros({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, price('1e3', '0'))).toThrow('Not a price');
  });
});

describe('speechCostMicros', () => {
  it('is audio length × price per hour, in micro-units', () => {
    // An hour at $1/h is $1; a minute at $0.36/h is $0.006.
    expect(speechCostMicros(3_600_000, null, audio('1'))).toBe(1_000_000);
    expect(speechCostMicros(60_000, null, audio('0.36'))).toBe(6_000);
  });

  it('stays exact where a per-second price would not fit six decimals', () => {
    // $1/h over 1 s is 277.78 micro-USD — per second it would be 0.000277(7…) USD.
    expect(speechCostMicros(1_000, null, audio('1'))).toBe(278);
    expect(speechCostMicros(9_000, null, audio('1'))).toBe(2_500);
  });

  it('adds the tokens a speech model reported, rounding once over both', () => {
    // 1000 × $2/M = 2000 micro-USD; 0.9 s at $1/h = 250 micro-USD.
    expect(speechCostMicros(900, { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 }, price('2', '0', '0', '0', '1'))).toBe(2_250);
  });

  it('is zero for a free recognizer and refuses a bad length', () => {
    expect(speechCostMicros(42_000, null, audio('0'))).toBe(0);
    expect(() => speechCostMicros(-1, null, audio('1'))).toThrow('Not an audio length');
    expect(() => speechCostMicros(1.5, null, audio('1'))).toThrow('Not an audio length');
  });
});
