import {
  durationFromPackets,
  parseFormatDuration,
  pcmSamples,
  peaksOf,
} from '../../../../src/infrastructure/audio/audio-measure.js';

describe('audio-measure', () => {
  it('parseFormatDuration', () => {
    expect(parseFormatDuration('12.345000\n')).toBe(12_345);
    expect(parseFormatDuration('N/A\n')).toBeNull();
    expect(parseFormatDuration('')).toBeNull();
    expect(parseFormatDuration('0.000000')).toBeNull();
  });

  it('durationFromPackets takes the end of the last packet', () => {
    const csv = ['0.000000,0.020000', '0.020000,0.020000', '4.980000,0.020000', ''].join('\n');
    expect(durationFromPackets(csv)).toBe(5_000);
  });

  it('durationFromPackets tolerates packets without a duration and out-of-order lines', () => {
    expect(durationFromPackets('3.000000,N/A\n1.000000,0.5\n')).toBe(3_000);
    expect(durationFromPackets('')).toBeNull();
    expect(durationFromPackets('N/A,N/A\n')).toBeNull();
  });

  it('peaksOf folds into bins scaled to the loudest', () => {
    const samples = Int16Array.from([0, 100, -200, 50, 0, -400, 10, 20]);
    expect(peaksOf(samples, 4)).toEqual([0.25, 0.5, 1, 0.05]);
  });

  it('peaksOf always returns the requested number of bins', () => {
    expect(peaksOf(Int16Array.from([1000, -1000]), 5)).toHaveLength(5);
    expect(peaksOf(new Int16Array(0), 3)).toEqual([0, 0, 0]);
    expect(peaksOf(new Int16Array(10), 2)).toEqual([0, 0]);
  });

  it('pcmSamples reads little-endian s16 and drops a trailing odd byte', () => {
    const bytes = Buffer.from([0x01, 0x00, 0xff, 0xff, 0x07]);
    expect(Array.from(pcmSamples(bytes))).toEqual([1, -1]);
  });
});
