import { audible, recordingLevel } from './recording-level.js';
import { levelledWav, silentWav } from './wav.fixture.js';

// Plan 88, step 4: a take Azure would hear nothing in is not sent.

describe('recordingLevel', () => {
  it('reads the pauses as the floor and the voice as the loud frames', () => {
    const level = recordingLevel(
      levelledWav([
        { ms: 400, dbfs: -60 },
        { ms: 1_600, dbfs: -20 },
      ]),
    )!;
    expect(level.floorDb).toBeCloseTo(-60, 0);
    expect(level.speechDb).toBeCloseTo(-20, 0);
    expect(level.contrastDb).toBeCloseTo(40, 0);
  });

  it('counts digital silence as the bottom of the scale', () => {
    expect(recordingLevel(silentWav(1_000))).toEqual({ floorDb: -96, speechDb: -96, contrastDb: 0 });
  });

  it('does not judge what it cannot read: not a WAV, not 16-bit PCM, shorter than a frame', () => {
    expect(recordingLevel(new Uint8Array([1, 2, 3]))).toBeNull();
    const float = silentWav(1_000);
    new DataView(float.buffer).setUint16(20, 3, true); // IEEE float
    expect(recordingLevel(float)).toBeNull();
    expect(recordingLevel(silentWav(10))).toBeNull();
  });
});

describe('audible', () => {
  it('hears a voice that stands out of its pauses', () => {
    // Like the phone takes Azure heard: 34–50 dB over the noise.
    expect(
      audible(
        recordingLevel(
          levelledWav([
            { ms: 500, dbfs: -62 },
            { ms: 2_000, dbfs: -25 },
          ]),
        ),
      ),
    ).toBe(true);
    // A browser take with silent pauses.
    expect(
      audible(
        recordingLevel(
          levelledWav([
            { ms: 500, dbfs: null },
            { ms: 2_000, dbfs: -15 },
          ]),
        ),
      ),
    ).toBe(true);
  });

  it('does not hear a take that barely rises out of its noise', () => {
    // Like the two phone takes Azure heard nothing in, even amplified: ~16 dB.
    expect(
      audible(
        recordingLevel(
          levelledWav([
            { ms: 500, dbfs: -48 },
            { ms: 2_000, dbfs: -32 },
          ]),
        ),
      ),
    ).toBe(false);
  });

  it('does not hear a constant tone, nor near-silence', () => {
    expect(audible(recordingLevel(levelledWav([{ ms: 2_000, dbfs: -23 }])))).toBe(false);
    expect(
      audible(
        recordingLevel(
          levelledWav([
            { ms: 500, dbfs: null },
            { ms: 2_000, dbfs: -55 },
          ]),
        ),
      ),
    ).toBe(false);
    expect(audible(recordingLevel(silentWav(2_000)))).toBe(false);
  });

  it('gives a recording it cannot measure the benefit of the doubt', () => {
    expect(audible(null)).toBe(true);
  });
});
