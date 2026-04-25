import { StorageKey } from '../../../../src/modules/assets/domain/value-objects/storage-key.vo.js';
import { MediaAssetDomainError } from '../../../../src/modules/assets/domain/exceptions/media-asset.exceptions.js';

describe('StorageKey', () => {
  describe('generate()', () => {
    it('generates key in format {ownerId}/{uuid}/{sanitizedFilename}', () => {
      const key = StorageKey.generate('user-123', 'My Photo.JPG');
      expect(key.value).toMatch(/^user-123\/[a-f0-9-]{36}\/my-photo\.jpg$/);
    });

    it('sanitizes filename — lowercases, replaces spaces with dashes, strips special chars', () => {
      // "Hello World! (2024).png"
      // lowercase → "hello world! (2024).png"
      // spaces→dashes → "hello-world!-(2024).png"
      // strip non [a-z0-9\-_.] → "hello-world-2024.png"
      const key = StorageKey.generate('u', 'Hello World! (2024).png');
      expect(key.value).toMatch(/\/hello-world-2024\.png$/);
    });

    it('uses "file" as fallback when filename is null', () => {
      const key = StorageKey.generate('u', null);
      expect(key.value).toMatch(/^u\/[a-f0-9-]{36}\/file$/);
    });

    it('generates unique keys for same owner and filename', () => {
      const k1 = StorageKey.generate('u', 'photo.jpg');
      const k2 = StorageKey.generate('u', 'photo.jpg');
      expect(k1.value).not.toBe(k2.value);
    });

    it('truncates filename to 128 characters', () => {
      const longName = 'a'.repeat(200) + '.jpg';
      const key = StorageKey.generate('u', longName);
      const filename = key.value.split('/')[2];
      expect(filename!.length).toBeLessThanOrEqual(128);
    });
  });

  describe('create()', () => {
    it('accepts valid key', () => {
      const result = StorageKey.create('user-1/abc-123/file.jpg');
      expect(result.isOk).toBe(true);
    });

    it('rejects empty key', () => {
      const result = StorageKey.create('');
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(MediaAssetDomainError.INVALID_STORAGE_KEY);
    });

    it('rejects key with illegal characters', () => {
      const result = StorageKey.create('user/file name with spaces.jpg');
      expect(result.isFail).toBe(true);
    });
  });

  describe('variantKey()', () => {
    it('generates variant key sharing the owner/uuid prefix', () => {
      const base = StorageKey.reconstitute('user-1/uuid-abc/original.jpg');
      const variant = base.variantKey('thumb_256', 'webp');
      expect(variant.value).toBe('user-1/uuid-abc/variants/thumb_256.webp');
    });
  });
});
