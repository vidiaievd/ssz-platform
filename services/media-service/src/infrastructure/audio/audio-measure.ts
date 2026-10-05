// Pure helpers behind the ffmpeg inspector — kept apart so they can be tested without
// a binary on the machine.

/** `ffprobe -show_entries format=duration` → ms; `N/A` and garbage → null. */
export function parseFormatDuration(stdout: string): number | null {
  const seconds = Number.parseFloat(stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
}

/**
 * `ffprobe -show_entries packet=pts_time,duration_time -of csv=p=0` → ms: the end of
 * the last packet. The fallback for containers without a duration header. A packet
 * with no duration still counts up to its timestamp.
 */
export function durationFromPackets(csv: string): number | null {
  let end = 0;
  for (const line of csv.split('\n')) {
    const [pts, dur] = line.trim().split(',');
    const start = Number.parseFloat(pts ?? '');
    if (!Number.isFinite(start)) continue;
    const length = Number.parseFloat(dur ?? '');
    end = Math.max(end, start + (Number.isFinite(length) ? length : 0));
  }
  return end > 0 ? Math.round(end * 1000) : null;
}

/**
 * Folds mono PCM into `bins` maxima of the absolute amplitude, scaled so the loudest
 * bin is 1. Relative, not absolute: a quiet microphone still draws a readable shape,
 * and loudness is the variants' business (loudnorm). Silence draws a flat line.
 */
export function peaksOf(samples: Int16Array, bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  const n = samples.length;
  if (n === 0 || bins <= 0) return out;

  for (let i = 0; i < bins; i++) {
    const start = Math.floor((i * n) / bins);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / bins));
    let max = 0;
    for (let j = start; j < end && j < n; j++) {
      const v = Math.abs(samples[j]!);
      if (v > max) max = v;
    }
    out[i] = max;
  }

  const loudest = Math.max(...out);
  if (loudest === 0) return out;
  return out.map((v) => Math.round((v / loudest) * 1000) / 1000);
}

/** Little-endian s16 bytes → samples. A trailing odd byte is dropped. */
export function pcmSamples(bytes: Buffer): Int16Array {
  const count = Math.floor(bytes.length / 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i++) samples[i] = bytes.readInt16LE(i * 2);
  return samples;
}
