import { IQuery } from '@nestjs/cqrs';

// What the engine needs to decide whether a recording may be submitted (plan 70 §3.5):
// whose it is, which attempt it belongs to, whether it survived ingest and how long it is.
export interface AssetDescription {
  id: string;
  ownerId: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  /** UPLOAD (a person's recording) or SYNTHESIZED (plan 74) — the batch narration never touches the first. */
  origin: string;
  /** `narrationTextHash` of the text a synthesized asset spoke; null for uploads. */
  textHash: string | null;
  /** The pace and pause multiplier a synthesized narration was spoken with, when recorded. */
  lengthScale: number | null;
  pauseScale: number | null;
  /** The catalog id of the narrator of a synthesized narration, when recorded. */
  voiceId: string | null;
}

export class DescribeAssetsQuery implements IQuery {
  constructor(readonly ids: readonly string[]) {}
}
