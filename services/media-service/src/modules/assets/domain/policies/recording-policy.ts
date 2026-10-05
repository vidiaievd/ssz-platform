import { LIMITS, RECORDING_MIME_TYPES, baseMime } from '@ssz/shared-kernel/read-aloud';
import { Result } from '../../../../shared/kernel/result.js';
import { MediaAssetDomainError } from '../exceptions/media-asset.exceptions.js';

// A student's spoken answer to a `read_aloud` prompt (plan 70, Q2-A).
//
// Its own kind rather than `exercise_asset`: exercise assets in READY are readable by
// any authenticated user (lesson pictures and sound), and a student's voice must not
// be. A recording is read by its owner through the public API and by a reviewer only
// through the internal playback route, after the engine has confirmed the submission
// is theirs to review. `entityId` is the attempt the recording was made for.
export const SUBMISSION_RECORDING = 'submission_recording';

export function isRecordingEntityType(entityType: string | null | undefined): boolean {
  return entityType === SUBMISSION_RECORDING;
}

// The ceilings are the kernel's, not a second copy: the recorder stops at them, the
// engine measures against them and this service refuses past them (README «Limits»).
export const RECORDING_MAX_BYTES = LIMITS.maxBytes;

/** The hard ceiling plus the tolerance the engine also forgives — a container measured in ms. */
export const RECORDING_MAX_DURATION_MS = Math.round(
  (LIMITS.hardMaxSeconds + LIMITS.toleranceSeconds) * 1000,
);

export interface RecordingRequest {
  mimeType: string;
  sizeBytes: bigint;
  entityId: string | null | undefined;
}

/** What a recording must satisfy before an upload URL is handed out. */
export function checkRecordingRequest(r: RecordingRequest): Result<void, MediaAssetDomainError> {
  if (!RECORDING_MIME_TYPES.includes(baseMime(r.mimeType))) {
    return Result.fail(MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED);
  }
  if (!r.entityId || r.entityId.trim() === '') {
    return Result.fail(MediaAssetDomainError.RECORDING_ATTEMPT_REQUIRED);
  }
  if (r.sizeBytes > BigInt(RECORDING_MAX_BYTES)) {
    return Result.fail(MediaAssetDomainError.RECORDING_TOO_LARGE);
  }
  return Result.ok();
}

/** The stored object's real size, on finalize — the declared size proves nothing. */
export function checkRecordingSize(sizeBytes: bigint): Result<void, MediaAssetDomainError> {
  return sizeBytes > BigInt(RECORDING_MAX_BYTES)
    ? Result.fail(MediaAssetDomainError.RECORDING_TOO_LARGE)
    : Result.ok();
}

/** The measured length; null when ffprobe could not read the file as audio. */
export function checkRecordingDuration(durationMs: number | null): Result<void, MediaAssetDomainError> {
  if (durationMs === null || durationMs <= 0) {
    return Result.fail(MediaAssetDomainError.RECORDING_UNREADABLE);
  }
  if (durationMs > RECORDING_MAX_DURATION_MS) {
    return Result.fail(MediaAssetDomainError.RECORDING_TOO_LONG);
  }
  return Result.ok();
}
