/**
 * A silent PCM 16-bit, 16 kHz, mono WAV of the given length — the format media's `speech`
 * variant has (plan 82, step 5). For tests of anything that takes a recording.
 */
export function silentWav(durationMs: number, opts: { listChunk?: boolean } = {}): Uint8Array {
  const sampleRate = 16_000;
  const byteRate = sampleRate * 2;
  const dataBytes = Math.round((durationMs * byteRate) / 1000);
  const list = opts.listChunk ? 12 : 0; // `LIST` + size + 4 bytes of payload
  const bytes = new Uint8Array(44 + list + dataBytes);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);

  text(0, 'RIFF');
  view.setUint32(4, 36 + list + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  if (opts.listChunk) {
    text(36, 'LIST');
    view.setUint32(40, 4, true);
    text(44, 'INFO');
  }
  text(36 + list, 'data');
  view.setUint32(40 + list, dataBytes, true);
  return bytes;
}
