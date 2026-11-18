import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ModelFeatures } from '../../../../providers/domain/model-features.js';
import type { AiBinding, BindingSettings } from '../../../domain/binding.js';
import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { BindingAudit, IBindingRepository } from '../../ports/binding.repository.js';
import type { ModelForCall } from '../../ports/registry.reader.js';
import { PutBindingCommand } from './put-binding.command.js';
import { PutBindingHandler } from './put-binding.handler.js';

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

const found = (id: string): ModelForCall => ({
  model: { id, providerId: 'p', providerCode: 'fake', providerModelId: id, displayName: id, modality: 'llm', features, status: 'active' },
  provider: { id: 'p', code: 'fake', kind: 'fake', displayName: 'Fake', baseUrl: null, apiVersion: null, credentialRef: null, region: 'local', enabled: true },
  currentPrice: null,
});

const settings: BindingSettings = {
  primaryModelId: 'a',
  fallbackModelId: 'b',
  maxOutputTokens: 512,
  temperature: null,
  timeoutMs: 30_000,
  promptVersion: 'diagnostic@1',
  enabled: true,
};

function setup(saveResult: Result<AiBinding, 'version_conflict'>, models: Record<string, ModelForCall> = { a: found('a'), b: found('b') }) {
  const saved: unknown[] = [];
  const notified: string[] = [];
  const repository = {
    save: async (...args: unknown[]) => {
      saved.push(args);
      return saveResult;
    },
  } as unknown as IBindingRepository;
  const handler = new PutBindingHandler(
    { getModelForCall: async (id: string) => models[id] ?? null } as never,
    { isSet: () => false },
    repository,
    { changed: async (c: string) => void notified.push(c) },
  );
  return { handler, saved, notified };
}

const admin: AdminActor = { userId: 'u1', level: 'super' };
const command = (capability: string, expectedVersion?: number) =>
  new PutBindingCommand(capability, settings, expectedVersion, admin, '  Sonnet reads reviews better  ');

const stored: AiBinding = { capability: 'diagnostic', ...settings, version: 2, updatedBy: 'u1', updatedAt: new Date() };

describe('PutBindingHandler', () => {
  it('saves, then tells the cache', async () => {
    const { handler, saved, notified } = setup(Result.ok(stored));
    await expect(handler.execute(command('diagnostic', 1))).resolves.toBe(stored);
    expect(saved).toHaveLength(1);
    expect((saved[0] as unknown[]).slice(0, 3)).toEqual(['diagnostic', settings, 1]);
    expect(notified).toEqual(['diagnostic']);
  });

  it('puts the write on the admin trail with what was there before and the version it makes', async () => {
    const { handler, saved } = setup(Result.ok(stored));
    await handler.execute(command('diagnostic', 1));
    const audit = (saved[0] as unknown[])[3] as BindingAudit;

    const before = { ...settings, primaryModelId: 'old', version: 1 };
    const entry = audit(before, 2);
    expect(entry).toMatchObject({
      actor: admin,
      action: 'binding.changed',
      targetType: 'capability',
      targetId: 'diagnostic',
      reason: 'Sonnet reads reviews better',
      before,
      after: { ...settings, version: 2 },
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('records a created binding without a before', async () => {
    const { handler, saved } = setup(Result.ok(stored));
    await handler.execute(command('diagnostic', 0));
    const audit = (saved[0] as unknown[])[3] as BindingAudit;
    expect(audit(null, 1)).toMatchObject({ before: null, after: { ...settings, version: 1 } });
  });

  it('is 404 for a capability not in the catalog', async () => {
    const { handler } = setup(Result.ok(stored));
    await expect(handler.execute(command('not_a_capability'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is 422 with the list of problems, and writes nothing', async () => {
    const { handler, saved, notified } = setup(Result.ok(stored), { a: found('a') });
    const error = await handler.execute(command('diagnostic')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ missing: ['fallback model b does not exist'] });
    expect(saved).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('is 409 on a stale version, and tells nobody', async () => {
    const { handler, notified } = setup(Result.fail('version_conflict'));
    await expect(handler.execute(command('diagnostic', 1))).rejects.toBeInstanceOf(ConflictException);
    expect(notified).toEqual([]);
  });
});
