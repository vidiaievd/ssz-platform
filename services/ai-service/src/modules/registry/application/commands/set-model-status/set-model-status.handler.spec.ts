import { NotFoundException } from '@nestjs/common';
import type { ModelFeatures } from '../../../../providers/domain/model-features.js';
import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { AiModel, AiModelPrice, AiModelStatus } from '../../../domain/registry.types.js';
import type { IRegistryReader } from '../../ports/registry.reader.js';
import type { IRegistryWriter, ModelStatusState, RegistryAudit } from '../../ports/registry.writer.js';
import type { StrandedBindings } from '../../stranded-bindings.js';
import { SetModelStatusCommand } from './set-model-status.command.js';
import { SetModelStatusHandler } from './set-model-status.handler.js';

const features: ModelFeatures = {
  structuredOutput: 'native',
  tools: true,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 8_000,
};

const model: AiModel = {
  id: 'm1',
  providerId: 'p1',
  providerCode: 'anthropic',
  providerModelId: 'claude-x',
  displayName: 'Claude X',
  modality: 'llm',
  features,
  status: 'active',
};

const price = { effectiveFrom: new Date(0), currency: 'USD' } as AiModelPrice;
const admin: AdminActor = { userId: 'u1', level: 'super' };

function setup(options: { missing?: boolean; changed?: boolean; stranded?: string[] } = {}) {
  const writes: { status: AiModelStatus; audit: RegistryAudit<ModelStatusState> }[] = [];
  const writer = {
    setModelStatus: async (_id: string, status: AiModelStatus, audit: RegistryAudit<ModelStatusState>) => {
      writes.push({ status, audit });
      return options.missing ? null : { value: { ...model, status }, changed: options.changed ?? true };
    },
  } as unknown as IRegistryWriter;
  const registry = { getModelForCall: async () => ({ model, provider: {}, currentPrice: price }) } as unknown as IRegistryReader;
  const stranded = { touching: async () => options.stranded ?? [] } as unknown as StrandedBindings;
  return { handler: new SetModelStatusHandler(registry, writer, stranded), writes };
}

describe('SetModelStatusHandler', () => {
  it('writes the status and answers the row as listed, with the bindings left without a model', async () => {
    const { handler, writes } = setup({ stranded: ['student_assist'] });
    const result = await handler.execute(new SetModelStatusCommand('m1', 'disabled', admin, 'retired'));
    expect(writes.map((w) => w.status)).toEqual(['disabled']);
    expect(result).toMatchObject({
      id: 'm1',
      status: 'disabled',
      currentPrice: price,
      changed: true,
      strandedCapabilities: ['student_assist'],
    });
  });

  it('puts the change on the trail with both sides', async () => {
    const { handler, writes } = setup();
    await handler.execute(new SetModelStatusCommand('m1', 'deprecated', admin, 'retires on the 30th'));
    const before: ModelStatusState = { providerCode: 'anthropic', providerModelId: 'claude-x', status: 'active' };
    expect(writes[0]!.audit(before)).toMatchObject({
      action: 'model.status_changed',
      targetType: 'model',
      targetId: 'm1',
      reason: 'retires on the 30th',
      before,
      after: { ...before, status: 'deprecated' },
    });
  });

  it('passes on a no-op as changed: false', async () => {
    const { handler } = setup({ changed: false });
    await expect(handler.execute(new SetModelStatusCommand('m1', 'active', admin, 'x'))).resolves.toMatchObject({ changed: false });
  });

  it('is 404 for an unknown model', async () => {
    const { handler } = setup({ missing: true });
    await expect(handler.execute(new SetModelStatusCommand('nope', 'active', admin, 'x'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
