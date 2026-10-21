import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { resolveEntitlements } from '../../../domain/entitlements.js';
import { ENTITLEMENT_INPUTS_READER, type IEntitlementInputsReader } from '../../ports/entitlement-inputs.reader.js';
import { ENTITLEMENT_SNAPSHOT_STORE, type IEntitlementSnapshotStore } from '../../ports/entitlement-snapshot.store.js';
import { PublishSnapshotsCommand } from './publish-snapshots.command.js';

/**
 * The account's revision is the outbox marker: every change bumps it in its own
 * transaction, so nothing committed can miss its event, and a burst of changes leaves one
 * snapshot of the final state. A change landing while a snapshot is built leaves the
 * revision ahead again — the next tick sends the newer one. Returns how many were sent.
 */
@CommandHandler(PublishSnapshotsCommand)
export class PublishSnapshotsHandler implements ICommandHandler<PublishSnapshotsCommand, number> {
  private readonly logger = new Logger(PublishSnapshotsHandler.name);

  constructor(
    @Inject(ENTITLEMENT_SNAPSHOT_STORE) private readonly snapshots: IEntitlementSnapshotStore,
    @Inject(ENTITLEMENT_INPUTS_READER) private readonly inputs: IEntitlementInputsReader,
  ) {}

  async execute(command: PublishSnapshotsCommand): Promise<number> {
    let sent = 0;
    for (const account of await this.snapshots.pending(command.batchSize)) {
      // One account that cannot be resolved must not hold up the ones behind it.
      try {
        const snapshot = resolveEntitlements(await this.inputs.load(account.type, account.externalId, new Date()));
        if (await this.snapshots.publish(snapshot)) sent++;
      } catch (err) {
        this.logger.error(
          `Snapshot of ${account.type} ${account.externalId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return sent;
  }
}
