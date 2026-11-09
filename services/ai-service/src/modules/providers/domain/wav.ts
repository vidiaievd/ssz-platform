/** A RIFF/WAVE recording's format and its sample bytes, as far as the file carries them. */
export interface WavData {
  /** 1 = PCM. */
  format: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  bitsPerSample: number;
  samples: Uint8Array;
}

/**
 * Reads the chunks rather than fixed offsets: encoders put `LIST` and other chunks between
 * `fmt ` and `data`. Null when the bytes are not a WAV with a format before its data.
 */
export function readWav(data: Uint8Array): WavData | null {
  if (data.length < 12 || ascii(data, 0) !== 'RIFF' || ascii(data, 8) !== 'WAVE') return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let fmt: Omit<WavData, 'samples'> | null = null;
  for (let offset = 12; offset + 8 <= data.length; ) {
    const id = ascii(data, offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && offset + 24 <= data.length) {
      fmt = {
        format: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        byteRate: view.getUint32(offset + 16, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    }
    if (id === 'data') {
      if (!fmt?.byteRate) return null;
      // A streamed WAV may announce more data than it carries; take what is there.
      const bytes = Math.min(size, data.length - offset - 8);
      return { ...fmt, samples: data.subarray(offset + 8, offset + 8 + bytes) };
    }
    offset += 8 + size + (size % 2); // chunks are padded to an even length
  }
  return null;
}

/** Length of a recording from its header — the data chunk over the byte rate — or null when the bytes are not a WAV. */
export function wavDurationMs(data: Uint8Array): number | null {
  const wav = readWav(data);
  return wav ? Math.round((wav.samples.length * 1000) / wav.byteRate) : null;
}

function ascii(data: Uint8Array, offset: number): string {
  return String.fromCharCode(...data.subarray(offset, offset + 4));
}
