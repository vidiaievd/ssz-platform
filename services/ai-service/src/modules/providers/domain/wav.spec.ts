import { wavDurationMs } from './wav.js';
import { silentWav } from './wav.fixture.js';

describe('wavDurationMs', () => {
  it('is the data chunk over the byte rate', () => {
    expect(wavDurationMs(silentWav(1_500))).toBe(1_500);
    expect(wavDurationMs(silentWav(0))).toBe(0);
  });

  it('finds the data chunk past other chunks', () => {
    expect(wavDurationMs(silentWav(2_000, { listChunk: true }))).toBe(2_000);
  });

  it('counts only the data a truncated file carries', () => {
    const wav = silentWav(1_000);
    expect(wavDurationMs(wav.subarray(0, 44 + 16_000))).toBe(500);
  });

  it('is null for anything that is not a WAV', () => {
    expect(wavDurationMs(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(wavDurationMs(new TextEncoder().encode('OggS........'))).toBeNull();
    // A data chunk before any fmt chunk: no byte rate to divide by.
    const noFmt = silentWav(1_000);
    noFmt.set(new TextEncoder().encode('junk'), 12);
    expect(wavDurationMs(noFmt)).toBeNull();
  });
});
