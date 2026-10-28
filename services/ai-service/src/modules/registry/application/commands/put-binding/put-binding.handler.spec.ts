import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ModelFeatures } from '../../../../providers/domain/model-features.js';
import type { AiBinding, BindingSettings } from '../../../domain/binding.js';
import type { IBindingRepository } from '../../ports/binding.repository.js';
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

const stored: AiBinding = { capability: 'diagnostic', ...settings, version: 2, updatedBy: 'u1', updatedAt: new Date() };

describe('PutBindingHandler', () => {
  it('saves, then tells the cache', async () => {
    const { handler, saved, notified } = setup(Result.ok(stored));
    await expect(handler.execute(new PutBindingCommand('diagnostic', settings, 1, 'u1'))).resolves.toBe(stored);
    expect(saved).toEqual([['diagnostic', settings, 1, 'u1']]);
    expect(notified).toEqual(['diagnostic']);
  });

  it('is 404 for a capability not in the catalog', async () => {
    const { handler } = setup(Result.ok(stored));
    await expect(handler.execute(new PutBindingCommand('student_assist', settings, undefined, 'u1'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is 422 with the list of problems, and writes nothing', async () => {
    const { handler, saved, notified } = setup(Result.ok(stored), { a: found('a') });
    const error = await handler.execute(new PutBindingCommand('diagnostic', settings, undefined, 'u1')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ missing: ['fallback model b does not exist'] });
    expect(saved).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('is 409 on a stale version, and tells nobody', async () => {
    const { handler, notified } = setup(Result.fail('version_conflict'));
    await expect(handler.execute(new PutBindingCommand('diagnostic', settings, 1, 'u1'))).rejects.toBeInstanceOf(ConflictException);
    expect(notified).toEqual([]);
  });
});
