import { MimeType } from '../../../../src/modules/assets/domain/value-objects/mime-type.vo.js';
import { MediaAssetDomainError } from '../../../../src/modules/assets/domain/exceptions/media-asset.exceptions.js';

describe('MimeType', () => {
  describe('create()', () => {
    it.each([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ])('accepts image MIME type %s', (mime) => {
      const result = MimeType.create(mime);
      expect(result.isOk).toBe(true);
      expect(result.value.value).toBe(mime);
      expect(result.value.isImage).toBe(true);
      expect(result.value.category).toBe('image');
    });

    it.each([
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/opus',
      'audio/aac',
    ])('accepts audio MIME type %s', (mime) => {
      const result = MimeType.create(mime);
      expect(result.isOk).toBe(true);
      expect(result.value.isAudio).toBe(true);
      expect(result.value.category).toBe('audio');
    });

    it.each([
      'video/mp4',
      'video/webm',
    ])('accepts video MIME type %s', (mime) => {
      const result = MimeType.create(mime);
      expect(result.isOk).toBe(true);
      expect(result.value.isVideo).toBe(true);
      expect(result.value.category).toBe('video');
    });

    it.each([
      'application/exe',
      'text/html',
      'application/pdf',
      'application/zip',
      '',
    ])('rejects disallowed type "%s"', (mime) => {
      const result = MimeType.create(mime);
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.MIME_TYPE_NOT_ALLOWED);
    });

    it('normalizes input to lowercase', () => {
      const result = MimeType.create('IMAGE/JPEG');
      expect(result.isOk).toBe(true);
      expect(result.value.value).toBe('image/jpeg');
    });

    it('isImage is false for audio', () => {
      const result = MimeType.create('audio/mpeg');
      expect(result.value.isImage).toBe(false);
      expect(result.value.isAudio).toBe(true);
      expect(result.value.isVideo).toBe(false);
    });
  });

  describe('recorder types (plan 70)', () => {
    it('accepts audio/webm as audio', () => {
      const result = MimeType.create('audio/webm');
      expect(result.isOk).toBe(true);
      expect(result.value.isAudio).toBe(true);
    });

    it.each([
      ['audio/webm;codecs=opus', 'audio/webm'],
      ['Audio/MP4; codecs="mp4a.40.2"', 'audio/mp4'],
      ['audio/ogg ; codecs=opus', 'audio/ogg'],
    ])('drops parameters: %s → %s', (raw, expected) => {
      const result = MimeType.create(raw);
      expect(result.isOk).toBe(true);
      expect(result.value.value).toBe(expected);
      expect(MimeType.isAllowed(raw)).toBe(true);
    });
  });
});
