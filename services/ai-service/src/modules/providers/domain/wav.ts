/**
 * Length of a RIFF/WAVE recording from its header — the data chunk over the byte rate — or
 * null when the bytes are not one. Reads the chunks rather than fixed offsets: encoders put
 * `LIST` and other chunks between `fmt ` and `data`.
 */
export function wavDurationMs(data: Uint8Array): number | null {
  if (data.length < 12 || ascii(data, 0) !== 'RIFF' || ascii(data, 8) !== 'WAVE') return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let byteRate: number | null = null;
  for (let offset = 12; offset + 8 <= data.length; ) {
    const id = ascii(data, offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && offset + 20 <= data.length) byteRate = view.getUint32(offset + 16, true);
    if (id === 'data') {
      if (!byteRate) return null;
      // A streamed WAV may announce more data than it carries; count what is there.
      const bytes = Math.min(size, data.length - offset - 8);
      return Math.round((bytes * 1000) / byteRate);
    }
    offset += 8 + size + (size % 2); // chunks are padded to an even length
  }
  return null;
}

function ascii(data: Uint8Array, offset: number): string {
  return String.fromCharCode(...data.subarray(offset, offset + 4));
}
