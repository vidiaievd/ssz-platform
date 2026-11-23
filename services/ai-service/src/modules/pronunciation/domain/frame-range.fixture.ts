/**
 * Carrier curves of three bench 9.3 clips (plan 88), tracked by the sidecar's own `pitch()`
 * (`infrastructure/whisper/server.py`, step 9.4) on the carrier words' Azure spans; `range` is
 * numpy's `percentile(90) − percentile(10)` of their voiced points. Generated 23.11.2026.
 */
export const BENCH_93_FRAMES: Record<string, { range: number; curves: Array<{ startMs: number; endMs: number; points: Array<number | null> }> }> = {
  synth_w01_Finn: {
    range: 13.86,
    curves: [
      { startMs: 160, endMs: 450, points: [null, null, null, null, null, null, 0.99, 0.94, 1.2, 1.56, 2.09, 2.88, 3.51, 3.86, 4.4, 5.18, 6.15, 6.98, 7.99, 9.13, 9.95, 10.69, 11.37, 11.9, 12.3, 12.6, 12.78, 12.77, 12.71] },
      { startMs: 460, endMs: 750, points: [null, null, null, null, null, null, null, null, null, null, null, 11.06, 10.8, 10.42, 9.89, 9.08, 8.28, 7.18, 5.23, 2.59, 0.7, -0.15, -0.84, -1.27, -1.55, -1.59, -1.58, -1.53, -1.3] },
      { startMs: 760, endMs: 910, points: [-0.81, -0.58, -0.33, 0.07, 0.44, 0.95, 1.25, 1.72, 2.38, 3.05, 3.48, 3.58, 3.49, 3.28, 3.09] },
      { startMs: 1220, endMs: 1550, points: [-1.63, -1.72, -1.89, -1.95, -2.06, -2.18, -2.21, -2.25, -2.38, -2.65, -2.88, -2.94, -3.0, -2.92, -3.27, -3.92, -4.07, -4.16, -3.9, -3.47, null, null, null, null, null, null, null, null, null, null, null, null, null] },
    ],
  },
  synth_w01_Pernille: {
    range: 7.18,
    curves: [
      { startMs: 140, endMs: 440, points: [null, null, null, null, null, null, null, 2.17, 0.2, -0.59, -0.53, -0.63, -0.65, -0.72, -0.17, -0.23, -0.36, -0.23, -0.14, 0.03, 0.34, 0.81, 1.44, 2.22, 3.02, 3.7, 4.45, 5.37, 6.0, 6.22] },
      { startMs: 450, endMs: 700, points: [null, null, null, null, null, null, null, null, null, null, null, 8.16, 6.82, 5.5, 4.86, 3.89, 3.14, 2.64, 2.2, 1.59, 1.2, 0.83, 0.62, -0.18, -0.45] },
      { startMs: 710, endMs: 800, points: [-0.53, -0.61, -0.4, -0.23, -0.03, 0.21, 0.44, 0.42, 0.29] },
      { startMs: 1130, endMs: 1420, points: [-0.93, -0.9, -0.91, -0.89, -0.8, -0.66, -0.46, -0.08, 0.2, 0.72, 1.41, 2.29, 3.15, 3.83, 5.05, 6.33, 7.24, 8.02, 8.83, 9.44, 9.63, null, null, null, null, null, null, null, null] },
    ],
  },
  owner_w01_own: {
    range: 4.16,
    curves: [
      { startMs: 1560, endMs: 1950, points: [null, null, null, null, null, null, 3.08, 2.72, 1.95, 1.75, 1.62, 1.4, 1.12, 0.89, 0.66, 0.5, 0.29, 0.05, -0.03, -0.15, -0.36, -0.52, -0.4, -0.28, -0.27, 0.0, 0.46, 1.05, 1.65, 2.68, 3.5, 4.27, 4.77, 5.05, 5.12, 5.23, 5.3, 5.29, 5.35] },
      { startMs: 1960, endMs: 2350, points: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 1.67, 1.07, 0.5, 0.53, 0.42, 0.49, 0.45, 0.4, 0.39, 0.27, -0.25, -0.32, -0.29, -0.03, -0.1, -0.16, -0.22, -0.36, -0.51, -0.68] },
      { startMs: 2360, endMs: 2730, points: [-0.94, -0.99, -0.94, -0.55, -0.02, 0.25, 0.3, 0.2, -0.09, -0.03, 0.37, 0.61, 0.88, 1.21, 1.59, 2.02, 2.39, 2.75, 3.17, 3.49, 3.7, 3.78, 3.78, 3.71, 3.6, 3.43, 3.21, 2.72, 1.74, 1.12, 0.67, 0.19, 0.19, 0.14, -0.11, -0.37, -0.41] },
      { startMs: 3240, endMs: 3630, points: [1.81, 1.42, 1.3, 0.99, 0.46, 0.09, -0.03, -0.15, -0.24, -0.35, -0.63, -0.58, -0.66, -0.62, -0.53, -0.38, -0.27, -0.19, -0.17, -0.03, 0.19, 0.11, -0.06, -0.23, -0.37, -0.68, -1.05, -1.09, -0.98, -0.98, -0.81, -0.75, -0.7, -0.54, -0.46, 0.03, -0.07, 0.38, 0.75] },
    ],
  },
};
