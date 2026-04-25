import { SizeBytes } from '../../../../src/modules/assets/domain/value-objects/size-bytes.vo.js';
import { MediaAssetDomainError } from '../../../../src/modules/assets/domain/exceptions/media-asset.exceptions.js';

const LIMITS = {
  maxImageSizeBytes: 20 * 1024 * 1024,   // 20 MB
  maxAudioSizeBytes: 100 * 1024 * 1024,  // 100 MB
  maxVideoSizeBytes: 500 * 1024 * 1024,  // 500 MB
};

describe('SizeBytes', () => {
  it('accepts valid image size', () => {
    const result = SizeBytes.create(1024, 'image', LIMITS);
    expect(result.isOk).toBe(true);
    expect(result.value.value).toBe(1024n);
    expect(result.value.asNumber).toBe(1024);
  });

  it('accepts exact limit for audio', () => {
    const result = SizeBytes.create(LIMITS.maxAudioSizeBytes, 'audio', LIMITS);
    expect(result.isOk).toBe(true);
  });

  it('rejects zero bytes', () => {
    const result = SizeBytes.create(0, 'image', LIMITS);
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(MediaAssetDomainError.FILE_TOO_LARGE);
  });

  it('rejects negative bytes', () => {
    const result = SizeBytes.create(-1, 'image', LIMITS);
    expect(result.isFail).toBe(true);
  });

  it('rejects image exceeding image limit', () => {
    const result = SizeBytes.create(LIMITS.maxImageSizeBytes + 1, 'image', LIMITS);
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(MediaAssetDomainError.FILE_TOO_LARGE);
  });

  it('accepts video size within video limit', () => {
    const result = SizeBytes.create(LIMITS.maxImageSizeBytes + 1, 'video', LIMITS);
    expect(result.isOk).toBe(true);
  });

  it('accepts bigint input', () => {
    const result = SizeBytes.create(2048n, 'image', LIMITS);
    expect(result.isOk).toBe(true);
    expect(result.value.value).toBe(2048n);
  });

  it('reconstitute() bypasses validation', () => {
    const size = SizeBytes.reconstitute(999999999999n);
    expect(size.value).toBe(999999999999n);
  });
});
