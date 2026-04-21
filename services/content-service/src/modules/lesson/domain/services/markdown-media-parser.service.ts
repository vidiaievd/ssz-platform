import { IMediaRefRow } from '../repositories/lesson-variant-media-ref.repository.interface.js';
import { MediaRefType } from '../value-objects/media-ref-type.vo.js';

interface RawMatch {
  index: number;
  mediaId: string;
  mediaType: MediaRefType;
}

/**
 * Pure domain service — no @Injectable, no external dependencies.
 * Parses custom media protocols from lesson body markdown.
 *
 * Supported protocols:
 *   Images:  ![alt text](media://mediaId)
 *   Audio:   [audio:mediaId] or [audio:mediaId "optional label"]
 *   Video:   [video:mediaId]
 *
 * All occurrences are returned (no deduplication). Duplicate mediaIds appearing
 * at different positions are each stored with their own positionInText, which
 * preserves full usage information for future media coverage analysis.
 *
 * positionInText is 0-based and reflects the order in which protocols appear
 * in the text across all types combined.
 */
export class MarkdownMediaParserService {
  // Matches: ![any alt text](media://mediaId)
  private static readonly IMAGE_REGEX = /!\[[^\]]*\]\(media:\/\/([a-zA-Z0-9_-]+)\)/g;

  // Matches: [audio:mediaId] or [audio:mediaId "optional label"]
  private static readonly AUDIO_REGEX = /\[audio:([a-zA-Z0-9_-]+)(?:\s+"[^"]*")?\]/g;

  // Matches: [video:mediaId]
  private static readonly VIDEO_REGEX = /\[video:([a-zA-Z0-9_-]+)\]/g;

  static parse(bodyMarkdown: string): IMediaRefRow[] {
    if (!bodyMarkdown) {
      return [];
    }

    const raw: RawMatch[] = [
      ...MarkdownMediaParserService.extractMatches(
        bodyMarkdown,
        MarkdownMediaParserService.IMAGE_REGEX,
        MediaRefType.IMAGE,
      ),
      ...MarkdownMediaParserService.extractMatches(
        bodyMarkdown,
        MarkdownMediaParserService.AUDIO_REGEX,
        MediaRefType.AUDIO,
      ),
      ...MarkdownMediaParserService.extractMatches(
        bodyMarkdown,
        MarkdownMediaParserService.VIDEO_REGEX,
        MediaRefType.VIDEO,
      ),
    ];

    // Sort by position in text so positionInText reflects actual document order.
    raw.sort((a, b) => a.index - b.index);

    return raw.map((match, position) => ({
      mediaId: match.mediaId,
      mediaType: match.mediaType,
      positionInText: position,
    }));
  }

  private static extractMatches(text: string, regex: RegExp, mediaType: MediaRefType): RawMatch[] {
    const matches: RawMatch[] = [];
    // RegExp.exec with /g flag advances lastIndex on each call.
    // Reset lastIndex to ensure re-entrant use is safe.
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        mediaId: match[1],
        mediaType,
      });
    }

    return matches;
  }
}
