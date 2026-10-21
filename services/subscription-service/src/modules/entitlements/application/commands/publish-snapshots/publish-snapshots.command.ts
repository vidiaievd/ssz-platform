/** Sends the snapshot of every account whose entitlements changed since its last one. */
export class PublishSnapshotsCommand {
  constructor(readonly batchSize = 50) {}
}
