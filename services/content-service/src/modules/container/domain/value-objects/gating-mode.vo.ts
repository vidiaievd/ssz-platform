// Controls how a course's sub-lessons unlock for students.
// - OPEN: every sub-lesson is available immediately (default).
// - SEQUENTIAL: a sub-lesson unlocks only once the previous one is complete.
// Only meaningful for containerType=COURSE; harmless default on other types.
export enum GatingMode {
  OPEN = 'open',
  SEQUENTIAL = 'sequential',
}
