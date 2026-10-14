import type { MediaAssetDomainError } from '../../../../assets/domain/exceptions/media-asset.exceptions.js';
import type { Result } from '../../../../../shared/kernel/result.js';

export class RequestNarrationCommand {
  constructor(
    public readonly ownerId: string,
    public readonly bodyMarkdown: string,
    public readonly lang: string,
    /** Shown in the author's asset list; becomes the file name. */
    public readonly label: string | null,
    /** The lesson the narration is for, stored as the asset's entity id. */
    public readonly lessonId: string | null,
    /** The course's CEFR level: picks the default pace. */
    public readonly level: string | null = null,
    /** The author's own pace and pauses; each falls back to the level's default. */
    public readonly lengthScale: number | null = null,
    public readonly pauseScale: number | null = null,
  ) {}
}

export interface RequestNarrationResult {
  assetId: string;
  /** PENDING_UPLOAD while speaking; then the usual UPLOADED → PROCESSING → READY. */
  status: string;
  voice: string;
  textHash: string;
  /** The pace and pauses the narration is spoken with — chosen or the level's default. */
  lengthScale: number;
  pauseScale: number;
  segments: number;
  characters: number;
}

export type RequestNarrationError =
  | 'EMPTY_TEXT'
  | 'TEXT_TOO_LONG'
  | 'LANGUAGE_NOT_SUPPORTED'
  | MediaAssetDomainError;

export type RequestNarrationOutcome = Result<RequestNarrationResult, RequestNarrationError>;
