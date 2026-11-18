// RIFF/WAVE reading and writing for uncompressed PCM — enough to stitch synthesized speech.
//
// A narration is synthesized segment by segment (one request per paragraph or turn) and
// joined with silence between them. Doing that on raw PCM keeps the join sample-exact and
// leaves one lossy encode at the end, instead of concatenating already-encoded mp3 frames.

export interface PcmFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export interface Pcm extends PcmFormat {
  /** Interleaved little-endian samples, exactly as in the `data` chunk. */
  data: Buffer;
}

const FORMAT_PCM = 1;

/** The PCM samples and format of a WAV file. Throws on anything but uncompressed PCM. */
export function parseWav(wav: Buffer): Pcm {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }

  let format: PcmFormat | null = null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ') {
      if (wav.readUInt16LE(body) !== FORMAT_PCM) throw new Error('WAV is not uncompressed PCM');
      format = {
        channels: wav.readUInt16LE(body + 2),
        sampleRate: wav.readUInt32LE(body + 4),
        bitsPerSample: wav.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!format) throw new Error('WAV data chunk precedes its fmt chunk');
      // Streaming writers leave the size at 0 or 0xFFFFFFFF; the data then runs to the end.
      const end = size === 0 || size === 0xffffffff ? wav.length : Math.min(wav.length, body + size);
      return { ...format, data: wav.subarray(body, end) };
    }

    // Chunks are padded to an even length.
    offset = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

/** `ms` of digital silence in `format`, aligned to whole sample frames. */
export function silence(ms: number, format: PcmFormat): Buffer {
  const frameBytes = format.channels * (format.bitsPerSample / 8);
  const frames = Math.round((format.sampleRate * ms) / 1000);
  return Buffer.alloc(frames * frameBytes);
}

export function sameFormat(a: PcmFormat, b: PcmFormat): boolean {
  return a.sampleRate === b.sampleRate && a.channels === b.channels && a.bitsPerSample === b.bitsPerSample;
}

/** A canonical 44-byte-header WAV around `pcm`. */
export function buildWav(pcm: Pcm): Buffer {
  const blockAlign = pcm.channels * (pcm.bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(FORMAT_PCM, 20);
  header.writeUInt16LE(pcm.channels, 22);
  header.writeUInt32LE(pcm.sampleRate, 24);
  header.writeUInt32LE(pcm.sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(pcm.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.data.length, 40);
  return Buffer.concat([header, pcm.data]);
}

/** Length of `pcm` in milliseconds. */
export function pcmDurationMs(pcm: Pcm): number {
  const frameBytes = pcm.channels * (pcm.bitsPerSample / 8);
  return Math.round((pcm.data.length / frameBytes / pcm.sampleRate) * 1000);
}

export interface TrimOptions {
  /** A sample counts as sound above this share of the clip's peak (default −50 dB). */
  thresholdOfPeak?: number;
  /** Silence kept before the first sound, so a soft onset (*s*, *f*) is not clipped. */
  leadMs?: number;
  /** Silence kept after the last sound, for the release. */
  tailMs?: number;
}

/**
 * `pcm` without the silence around the sound (plan 86, step 4z.6): Azure pads a word spoken alone
 * to ~1.8 s, so a clip of *se* played for 1.3 s of nothing. Only 16-bit PCM is trimmed; any other
 * format, and a clip with no sound at all, is returned as it is.
 */
export function trimSilence(pcm: Pcm, options: TrimOptions = {}): Pcm {
  if (pcm.bitsPerSample !== 16) return pcm;
  const { thresholdOfPeak = 0.003, leadMs = 100, tailMs = 150 } = options;
  const frameBytes = pcm.channels * 2;
  const frames = Math.floor(pcm.data.length / frameBytes);
  const level = (frame: number): number => {
    let max = 0;
    for (let c = 0; c < pcm.channels; c += 1) {
      max = Math.max(max, Math.abs(pcm.data.readInt16LE(frame * frameBytes + c * 2)));
    }
    return max;
  };

  let peak = 0;
  for (let f = 0; f < frames; f += 1) peak = Math.max(peak, level(f));
  if (peak === 0) return pcm;
  const threshold = peak * thresholdOfPeak;

  let first = 0;
  while (first < frames && level(first) <= threshold) first += 1;
  let last = frames - 1;
  while (last > first && level(last) <= threshold) last -= 1;

  const from = Math.max(0, first - Math.round((pcm.sampleRate * leadMs) / 1000));
  const to = Math.min(frames, last + 1 + Math.round((pcm.sampleRate * tailMs) / 1000));
  return { ...pcm, data: pcm.data.subarray(from * frameBytes, to * frameBytes) };
}
