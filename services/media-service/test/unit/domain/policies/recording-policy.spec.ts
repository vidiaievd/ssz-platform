import { LIMITS } from '@ssz/shared-kernel/read-aloud';
import {
  RECORDING_MAX_BYTES,
  RECORDING_MAX_DURATION_MS,
  checkRecordingDuration,
  checkRecordingRequest,
  checkRecordingSize,
  isRecordingEntityType,
} from '../../../../src/modules/assets/domain/policies/recording-policy.js';
import { MediaAssetDomainError } from '../../../../src/modules/assets/domain/exceptions/media-asset.exceptions.js';
import { isContentEntityType, isPublicEntityType } from '../../../../src/shared/application/ports/storage.port.js';

describe('recording policy', () => {
  it('reads its ceilings from the kernel', () => {
    expect(RECORDING_MAX_BYTES).toBe(LIMITS.maxBytes);
    expect(RECORDING_MAX_DURATION_MS).toBe((LIMITS.hardMaxSeconds + LIMITS.toleranceSeconds) * 1000);
  });

  it('is a private kind that is not readable content', () => {
    expect(isRecordingEntityType('submission_recording')).toBe(true);
    expect(isRecordingEntityType('exercise_asset')).toBe(false);
    expect(isPublicEntityType('submission_recording')).toBe(false);
    expect(isContentEntityType('submission_recording')).toBe(false);
  });

  describe('checkRecordingRequest', () => {
    const ok = { mimeType: 'audio/webm;codecs=opus', sizeBytes: 1000n, entityId: 'attempt-1' };

    it('accepts webm, mp4 and ogg', () => {
      for (const mimeType of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg']) {
        expect(checkRecordingRequest({ ...ok, mimeType }).isOk).toBe(true);
      }
    });

    it('refuses other types', () => {
      expect(checkRecordingRequest({ ...ok, mimeType: 'audio/mpeg' }).error).toBe(
        MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED,
      );
    });

    it('requires an attempt id', () => {
      expect(checkRecordingRequest({ ...ok, entityId: null }).error).toBe(
        MediaAssetDomainError.RECORDING_ATTEMPT_REQUIRED,
      );
      expect(checkRecordingRequest({ ...ok, entityId: '  ' }).error).toBe(
        MediaAssetDomainError.RECORDING_ATTEMPT_REQUIRED,
      );
    });

    it('accepts exactly 8 MB and refuses one byte more', () => {
      expect(checkRecordingRequest({ ...ok, sizeBytes: BigInt(RECORDING_MAX_BYTES) }).isOk).toBe(true);
      expect(checkRecordingRequest({ ...ok, sizeBytes: BigInt(RECORDING_MAX_BYTES + 1) }).error).toBe(
        MediaAssetDomainError.RECORDING_TOO_LARGE,
      );
    });
  });

  it('checkRecordingSize', () => {
    expect(checkRecordingSize(BigInt(RECORDING_MAX_BYTES)).isOk).toBe(true);
    expect(checkRecordingSize(BigInt(RECORDING_MAX_BYTES + 1)).error).toBe(
      MediaAssetDomainError.RECORDING_TOO_LARGE,
    );
  });

  it('checkRecordingDuration', () => {
    expect(checkRecordingDuration(180_500).isOk).toBe(true);
    expect(checkRecordingDuration(180_501).error).toBe(MediaAssetDomainError.RECORDING_TOO_LONG);
    expect(checkRecordingDuration(null).error).toBe(MediaAssetDomainError.RECORDING_UNREADABLE);
    expect(checkRecordingDuration(0).error).toBe(MediaAssetDomainError.RECORDING_UNREADABLE);
  });
});
