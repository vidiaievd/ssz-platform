// Public surface of the audio layer — plan 56 phase 1.

export type {
  AudioLayout,
  AudioSettings,
  AudioSource,
  ExerciseAudio,
  GateMode,
  ItemAudio,
  LessonAudioRef,
  PlayLimit,
  TranscriptPolicy,
} from './model.js';
export {
  AUDIO_DEFAULT,
  audioOf,
  audioOn,
  formatDuration,
  hasClip,
  parseDuration,
  segmentOf,
} from './model.js';

export type {
  AllowanceContext,
  AllowanceEvent,
  AllowanceState,
  AllowanceStep,
  PlaybackEffect,
} from './allowance.js';
export { canPlay, hasHeard, INITIAL_STATE, isExhausted, isGated, limitOf, step } from './allowance.js';

export type {
  AudioIssue,
  AudioIssueCode,
  AudioIssueLevel,
  AudioIssuePart,
  AudioItem,
  AudioStepMap,
  PlacedAudioIssue,
} from './issues.js';
export { audioIssues, hasAudioBlocker, placeAudioIssues } from './issues.js';

export type { StudentAudio } from './projection.js';
export { deliveredSegments, redactTranscript, segmentsOf, transcriptOnReveal, withStudentAudio } from './projection.js';

export type { IdentifiedItem } from './items.js';
export { itemKey, itemsOf } from './items.js';

export type { AudioDraft } from './authoring.js';
export {
  applyAudioDraft,
  draftIssues,
  readAudioDraft,
  withAudio,
  withAudioSettings,
  withSegment,
} from './authoring.js';
