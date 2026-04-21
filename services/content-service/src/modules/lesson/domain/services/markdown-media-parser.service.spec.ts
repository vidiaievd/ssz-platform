import { MarkdownMediaParserService } from './markdown-media-parser.service.js';
import { MediaRefType } from '../value-objects/media-ref-type.vo.js';

describe('MarkdownMediaParserService', () => {
  describe('empty or blank input', () => {
    it('returns empty array for empty string', () => {
      expect(MarkdownMediaParserService.parse('')).toEqual([]);
    });

    it('returns empty array for plain text with no media protocols', () => {
      const result = MarkdownMediaParserService.parse(
        '# Introduction\n\nThis is a plain lesson with no media.',
      );
      expect(result).toEqual([]);
    });
  });

  describe('image protocol', () => {
    it('extracts a single image reference', () => {
      const md = '![A cat](media://img_001)';
      const result = MarkdownMediaParserService.parse(md);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        mediaId: 'img_001',
        mediaType: MediaRefType.IMAGE,
        positionInText: 0,
      });
    });

    it('handles image with empty alt text', () => {
      const result = MarkdownMediaParserService.parse('![](media://img_empty)');
      expect(result[0].mediaId).toBe('img_empty');
      expect(result[0].mediaType).toBe(MediaRefType.IMAGE);
    });
  });

  describe('audio protocol', () => {
    it('extracts audio without label', () => {
      const result = MarkdownMediaParserService.parse('[audio:aud_002]');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        mediaId: 'aud_002',
        mediaType: MediaRefType.AUDIO,
        positionInText: 0,
      });
    });

    it('extracts audio with label', () => {
      const result = MarkdownMediaParserService.parse('[audio:aud_x "Listen here"]');
      expect(result).toHaveLength(1);
      expect(result[0].mediaId).toBe('aud_x');
      expect(result[0].mediaType).toBe(MediaRefType.AUDIO);
    });
  });

  describe('video protocol', () => {
    it('extracts a single video reference', () => {
      const result = MarkdownMediaParserService.parse('[video:vid_003]');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        mediaId: 'vid_003',
        mediaType: MediaRefType.VIDEO,
        positionInText: 0,
      });
    });
  });

  describe('mixed protocols — positionInText reflects document order', () => {
    it('assigns positions in the order protocols appear in the text', () => {
      const md = [
        '![intro image](media://img_001)',
        '',
        '[audio:aud_002 "Listen here"]',
        '',
        '[video:vid_003]',
      ].join('\n');

      const result = MarkdownMediaParserService.parse(md);

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ mediaId: 'img_001', mediaType: MediaRefType.IMAGE, positionInText: 0 });
      expect(result[1]).toMatchObject({ mediaId: 'aud_002', mediaType: MediaRefType.AUDIO, positionInText: 1 });
      expect(result[2]).toMatchObject({ mediaId: 'vid_003', mediaType: MediaRefType.VIDEO, positionInText: 2 });
    });

    it('preserves order when audio appears before image in text', () => {
      const md = '[audio:aud_first]\n\n![second](media://img_second)';
      const result = MarkdownMediaParserService.parse(md);

      expect(result[0]).toMatchObject({ mediaId: 'aud_first', positionInText: 0 });
      expect(result[1]).toMatchObject({ mediaId: 'img_second', positionInText: 1 });
    });

    it('stores all occurrences of the same mediaId (no deduplication)', () => {
      const md = '![a](media://img_001)\n\n![b](media://img_001)';
      const result = MarkdownMediaParserService.parse(md);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ mediaId: 'img_001', positionInText: 0 });
      expect(result[1]).toMatchObject({ mediaId: 'img_001', positionInText: 1 });
    });
  });
});
