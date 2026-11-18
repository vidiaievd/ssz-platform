import { buildWav, parseWav, pcmDurationMs, sameFormat, silence, trimSilence } from '../../../../src/infrastructure/audio/wav.js';

const PIPER = { sampleRate: 22_050, channels: 1, bitsPerSample: 16 };

describe('wav', () => {
  it('round-trips PCM through a canonical header', () => {
    const data = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    const parsed = parseWav(buildWav({ ...PIPER, data }));

    expect(parsed).toMatchObject(PIPER);
    expect(Buffer.compare(parsed.data, data)).toBe(0);
  });

  it('skips chunks before the data chunk, including an odd-sized one', () => {
    const canonical = buildWav({ ...PIPER, data: Buffer.from([9, 0, 8, 0]) });
    const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc'), Buffer.from([0])]);
    const withList = Buffer.concat([canonical.subarray(0, 36), list, canonical.subarray(36)]);

    expect([...parseWav(withList).data]).toEqual([9, 0, 8, 0]);
  });

  it('reads a streamed WAV whose data size was never filled in', () => {
    const wav = buildWav({ ...PIPER, data: Buffer.from([5, 0, 6, 0]) });
    wav.writeUInt32LE(0xffffffff, 40);

    expect([...parseWav(wav).data]).toEqual([5, 0, 6, 0]);
  });

  it('refuses anything that is not PCM WAV', () => {
    expect(() => parseWav(Buffer.from('ID3 not a wav at all'))).toThrow('not a RIFF/WAVE file');
    const float = buildWav({ ...PIPER, data: Buffer.alloc(4) });
    float.writeUInt16LE(3, 20);
    expect(() => parseWav(float)).toThrow('not uncompressed PCM');
  });

  it('makes frame-aligned silence and measures duration', () => {
    const pause = silence(600, PIPER);

    expect(pause.length).toBe(13_230 * 2);
    expect(pause.every((b) => b === 0)).toBe(true);
    expect(pcmDurationMs({ ...PIPER, data: pause })).toBe(600);
    expect(sameFormat(PIPER, { ...PIPER, sampleRate: 16_000 })).toBe(false);
  });

  describe('trimSilence', () => {
    const AZURE = { sampleRate: 16_000, channels: 1, bitsPerSample: 16 };
    /** `ms` of a steady level, as 16-bit mono at 16 kHz. */
    const tone = (ms: number, value: number): Buffer => {
      const out = Buffer.alloc(16 * ms * 2);
      for (let i = 0; i < out.length; i += 2) out.writeInt16LE(i % 4 === 0 ? value : -value, i);
      return out;
    };

    it('keeps the sound with the lead and tail margins and drops the padding around it', () => {
      const data = Buffer.concat([silence(200, AZURE), tone(300, 20_000), silence(1300, AZURE)]);
      const trimmed = trimSilence({ ...AZURE, data });

      expect(pcmDurationMs(trimmed)).toBe(100 + 300 + 150);
      expect(trimmed.data.readInt16LE(100 * 16 * 2)).toBe(20_000);
    });

    it('counts a soft onset far below the peak as sound', () => {
      const data = Buffer.concat([silence(200, AZURE), tone(50, 200), tone(300, 20_000), silence(500, AZURE)]);

      expect(pcmDurationMs(trimSilence({ ...AZURE, data }))).toBe(100 + 50 + 300 + 150);
    });

    it('never reaches past the clip edges', () => {
      const data = Buffer.concat([silence(20, AZURE), tone(300, 20_000), silence(40, AZURE)]);

      expect(pcmDurationMs(trimSilence({ ...AZURE, data }))).toBe(360);
    });

    it('leaves digital silence and other sample widths as they are', () => {
      const quiet = { ...AZURE, data: silence(500, AZURE) };
      const eightBit = { ...AZURE, bitsPerSample: 8, data: Buffer.alloc(100) };

      expect(trimSilence(quiet)).toBe(quiet);
      expect(trimSilence(eightBit)).toBe(eightBit);
    });
  });
});
