import type { EntitlementInputs } from '../../../domain/entitlements.js';
import type { IEntitlementInputsReader } from '../../ports/entitlement-inputs.reader.js';
import type { IEntitlementSnapshotStore } from '../../ports/entitlement-snapshot.store.js';
import { PublishSnapshotsCommand } from './publish-snapshots.command.js';
import { PublishSnapshotsHandler } from './publish-snapshots.handler.js';

const now = new Date('2026-10-21T10:00:00.000Z');

const inputsFor = (externalId: string, revision: number): EntitlementInputs => ({
  account: { type: 'workspace', externalId, revision },
  subscription: null,
  freePlan: { code: 'free_workspace', name: 'Free', version: 1, features: [] },
  grants: [],
  now,
});

describe('PublishSnapshotsHandler', () => {
  it('publishes each pending account at its revision and skips one that fails to load', async () => {
    const store = {
      pending: jest.fn().mockResolvedValue([
        { type: 'workspace', externalId: 'a' },
        { type: 'workspace', externalId: 'broken' },
        { type: 'workspace', externalId: 'b' },
      ]),
      publish: jest.fn().mockResolvedValue(true),
    } as unknown as IEntitlementSnapshotStore;
    const reader = {
      load: jest.fn(async (_type: string, id: string) => {
        if (id === 'broken') throw new Error('db hiccup');
        return inputsFor(id, id === 'a' ? 3 : 1);
      }),
    } as unknown as IEntitlementInputsReader;

    const sent = await new PublishSnapshotsHandler(store, reader).execute(new PublishSnapshotsCommand());

    expect(sent).toBe(2);
    const published = (store.publish as jest.Mock).mock.calls.map(([s]) => [s.account.externalId, s.version, s.source]);
    expect(published).toEqual([
      ['a', 3, 'free_plan'],
      ['b', 1, 'free_plan'],
    ]);
  });

  it('does not count a snapshot an equal or newer one already beat', async () => {
    const store = {
      pending: jest.fn().mockResolvedValue([{ type: 'workspace', externalId: 'a' }]),
      publish: jest.fn().mockResolvedValue(false),
    } as unknown as IEntitlementSnapshotStore;
    const reader = { load: jest.fn().mockResolvedValue(inputsFor('a', 2)) } as unknown as IEntitlementInputsReader;
    expect(await new PublishSnapshotsHandler(store, reader).execute(new PublishSnapshotsCommand())).toBe(0);
  });
});
