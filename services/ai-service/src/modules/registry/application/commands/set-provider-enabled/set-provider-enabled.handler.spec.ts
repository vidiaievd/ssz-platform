import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AdminActor, AdminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import type { AiProvider } from '../../../domain/registry.types.js';
import type { IRegistryReader } from '../../ports/registry.reader.js';
import type { IRegistryWriter, ProviderSwitchState, RegistryAudit } from '../../ports/registry.writer.js';
import type { StrandedBindings } from '../../stranded-bindings.js';
import { SetProviderEnabledCommand } from './set-provider-enabled.command.js';
import { SetProviderEnabledHandler } from './set-provider-enabled.handler.js';

const provider: AiProvider = {
  id: 'p1',
  code: 'anthropic',
  kind: 'anthropic',
  displayName: 'Anthropic',
  baseUrl: null,
  apiVersion: null,
  credentialRef: 'ANTHROPIC_API_KEY',
  region: 'us',
  enabled: true,
};

const admin: AdminActor = { userId: 'u1', level: 'super' };

function setup(options: { found?: AiProvider | null; keySet?: boolean; changed?: boolean; stranded?: string[] } = {}) {
  const writes: { enabled: boolean; audit: RegistryAudit<ProviderSwitchState> }[] = [];
  const touched: string[][] = [];
  const registry = {
    getProvider: async () => (options.found === undefined ? provider : options.found),
    listModels: async () => [{ id: 'm1' }, { id: 'm2' }],
  } as unknown as IRegistryReader;
  const writer = {
    setProviderEnabled: async (_id: string, enabled: boolean, audit: RegistryAudit<ProviderSwitchState>) => {
      writes.push({ enabled, audit });
      return { value: { ...provider, enabled }, changed: options.changed ?? true };
    },
  } as unknown as IRegistryWriter;
  const stranded = {
    touching: async (ids: Iterable<string>) => {
      touched.push([...ids]);
      return options.stranded ?? [];
    },
  } as unknown as StrandedBindings;
  const handler = new SetProviderEnabledHandler(registry, writer, { isSet: () => options.keySet ?? true }, stranded);
  return { handler, writes, touched };
}

describe('SetProviderEnabledHandler', () => {
  it('switches off, names the bindings left without a model, and answers the row as listed', async () => {
    const { handler, writes, touched } = setup({ stranded: ['review_draft'] });
    const result = await handler.execute(new SetProviderEnabledCommand('p1', false, admin, 'outage'));
    expect(writes.map((w) => w.enabled)).toEqual([false]);
    expect(touched).toEqual([['m1', 'm2']]);
    expect(result).toMatchObject({
      id: 'p1',
      enabled: false,
      modelCount: 2,
      configured: true,
      missing: [],
      changed: true,
      strandedCapabilities: ['review_draft'],
    });
  });

  it('puts the flip on the trail with both sides', async () => {
    const { handler, writes } = setup();
    await handler.execute(new SetProviderEnabledCommand('p1', false, admin, '  Anthropic answers 529  '));
    const entry: AdminAuditEntry = writes[0]!.audit({ code: 'anthropic', enabled: true });
    expect(entry).toMatchObject({
      actor: admin,
      action: 'provider.toggled',
      targetType: 'provider',
      targetId: 'p1',
      reason: 'Anthropic answers 529',
      before: { code: 'anthropic', enabled: true },
      after: { code: 'anthropic', enabled: false },
    });
  });

  it('refuses to switch on a provider without its key, listing what is missing, and writes nothing', async () => {
    const { handler, writes } = setup({ keySet: false });
    const error = await handler.execute(new SetProviderEnabledCommand('p1', true, admin, 'key is in')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      missing: ['environment variable ANTHROPIC_API_KEY is not set'],
    });
    expect(writes).toEqual([]);
  });

  it('lets an unconfigured provider be switched off', async () => {
    const { handler, writes } = setup({ keySet: false });
    const result = await handler.execute(new SetProviderEnabledCommand('p1', false, admin, 'tidy up'));
    expect(writes).toHaveLength(1);
    expect(result).toMatchObject({ configured: false, enabled: false });
  });

  it('passes on a no-op as changed: false', async () => {
    const { handler } = setup({ changed: false });
    await expect(handler.execute(new SetProviderEnabledCommand('p1', true, admin, 'again'))).resolves.toMatchObject({ changed: false });
  });

  it('is 404 for an unknown provider', async () => {
    const { handler, writes } = setup({ found: null });
    await expect(handler.execute(new SetProviderEnabledCommand('nope', false, admin, 'x'))).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });
});
