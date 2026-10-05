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
}

export class DescribeAssetsQuery implements IQuery {
  constructor(readonly ids: readonly string[]) {}
}
