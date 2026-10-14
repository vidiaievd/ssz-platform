import type { NarrationSegment } from '@ssz/shared-kernel/narration';

/** A queued narration: everything the worker needs, so it never re-reads the lesson. */
export interface NarrationJobData {
  assetId: string;
  /** Row in `processing_jobs`; also the BullMQ job id. */
  jobId: string;
  ownerId: string;
  lang: string;
  segments: NarrationSegment[];
  textHash: string;
}
