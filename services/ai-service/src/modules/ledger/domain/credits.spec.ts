import { creditsFor, microCredits, parseRate } from './credits.js';

describe('creditsFor', () => {
  it('multiplies cost by the rate per currency unit', () => {
    // 0.0123 USD at 1000 credits per USD = 12.3 credits.
    expect(creditsFor(12_300, '1000')).toBe('12.300000');
  });

  it('keeps a call too cheap for a whole credit', () => {
    // 50 micro-USD at 1000/USD = 0.05 credit — rounding it to 0 would let quotas leak.
    expect(creditsFor(50, '1000')).toBe('0.050000');
  });

  it('rounds half up at the sixth place', () => {
    // 1 micro-USD × 0.5 credits/USD = 0.0000005 → 0.000001.
    expect(creditsFor(1, '0.5')).toBe('0.000001');
    expect(creditsFor(1, '0.4')).toBe('0.000000');
  });

  it('is zero for a free call', () => {
    expect(creditsFor(0, '1000')).toBe('0.000000');
  });

  it('rejects a malformed rate or cost', () => {
    expect(() => parseRate('1e3')).toThrow();
    expect(() => parseRate('-1')).toThrow();
    expect(() => parseRate('0.1234567')).toThrow();
    expect(() => creditsFor(-1, '1')).toThrow();
    expect(() => creditsFor(1.5, '1')).toThrow();
  });
});

describe('microCredits', () => {
  it.each([
    ['0.135000', 135_000n],
    ['12', 12_000_000n],
    ['1.5', 1_500_000n],
  ])('%s → %s', (credits, micro) => expect(microCredits(credits)).toBe(micro));

  it('rejects anything but a plain decimal', () => {
    expect(() => microCredits('1e-6')).toThrow();
    expect(() => microCredits('-1')).toThrow();
  });
});
