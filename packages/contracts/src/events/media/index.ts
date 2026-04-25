import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const MEDIA_EVENT_TYPES = {
  UPLOADED: 'media.uploaded',
  PROCESSED: 'media.processed',
  PROCESSING_FAILED: 'media.processing_failed',
  DELETED: 'media.deleted',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface MediaUploadedPayload {
  assetId: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  entityType: string | null;
  entityId: string | null;
}

export interface MediaProcessedPayload {
  assetId: string;
  ownerId: string;
  variants: Array<{
    variantType: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

export interface MediaProcessingFailedPayload {
  assetId: string;
  ownerId: string;
  jobType: string;
  reason: string;
}

export interface MediaDeletedPayload {
  assetId: string;
  ownerId: string;
  storageKey: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type MediaUploadedEvent = BaseEvent<MediaUploadedPayload>;
export type MediaProcessedEvent = BaseEvent<MediaProcessedPayload>;
export type MediaProcessingFailedEvent = BaseEvent<MediaProcessingFailedPayload>;
export type MediaDeletedEvent = BaseEvent<MediaDeletedPayload>;

export type AnyMediaEvent =
  | MediaUploadedEvent
  | MediaProcessedEvent
  | MediaProcessingFailedEvent
  | MediaDeletedEvent;
