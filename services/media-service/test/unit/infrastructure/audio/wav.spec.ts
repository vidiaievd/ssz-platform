import { buildWav, parseWav, pcmDurationMs, sameFormat, silence } from '../../../../src/infrastructure/audio/wav.js';

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
});
