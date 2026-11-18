import { resolveSpendPeriod, type SpendPeriod } from '../../../domain/platform-spend.js';
import type { IBindingRepository } from '../../ports/binding.repository.js';
import type { IRegistryReader } from '../../ports/registry.reader.js';
import type { ISpendReader } from '../../ports/spend.reader.js';
import { GetPlatformSpendHandler } from './get-platform-spend.handler.js';
import { GetPlatformSpendQuery } from './get-platform-spend.query.js';

describe('GetPlatformSpendHandler', () => {
  it('reads the ledger for the period’s bounds and names it from the registry and bindings', async () => {
    const resolved = resolveSpendPeriod('2026-11-01', '2026-11-02', new Date('2026-11-14T00:00:00Z'));
    const period = (resolved as { ok: true; period: SpendPeriod }).period;
    const asked: [Date, Date][] = [];

    const handler = new GetPlatformSpendHandler(
      {
        rows: async (start: Date, end: Date) => {
          asked.push([start, end]);
          return [];
        },
      } as ISpendReader,
      { listModels: async () => [], listProviders: async () => [] } as unknown as IRegistryReader,
      {
        list: async () => [
          {
            capability: 'diagnostic',
            primaryModelId: 'm1',
            fallbackModelId: null,
            maxOutputTokens: 1,
            temperature: null,
            timeoutMs: 1,
            promptVersion: 'diagnostic@1',
            enabled: true,
            version: 1,
            updatedBy: 'u',
            updatedAt: new Date(),
          },
        ],
      } as unknown as IBindingRepository,
    );

    const spend = await handler.execute(new GetPlatformSpendQuery(period));
    expect(asked.map(([s, e]) => [s.toISOString(), e.toISOString()])).toEqual([
      ['2026-11-01T00:00:00.000Z', '2026-11-03T00:00:00.000Z'],
    ]);
    expect(spend.from).toBe('2026-11-01');
    expect(spend.daily).toHaveLength(2);
    expect(spend.models).toEqual([
      expect.objectContaining({ modelId: 'm1', model: null, boundTo: [{ capability: 'diagnostic', role: 'primary' }] }),
    ]);
  });
});
