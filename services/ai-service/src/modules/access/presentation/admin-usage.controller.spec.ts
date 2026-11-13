import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { PayerUsage } from '../application/queries/get-payer-usage/get-payer-usage.handler.js';
import { GetPayerUsageQuery } from '../application/queries/get-payer-usage/get-payer-usage.query.js';
import { AdminUsageController } from './admin-usage.controller.js';

const SCHOOL = '6f1c2b0e-8a7d-4c1e-9d0a-1b2c3d4e5f60';
const POLICY = {
  payerType: 'workspace' as const,
  payerId: SCHOOL,
  aiEnabled: true,
  allowedRegions: null,
  stored: false,
  updatedBy: null,
  updatedAt: null,
};

function controllerAnswering(result: PayerUsage) {
  const asked: unknown[] = [];
  const queryBus = { execute: async (query: unknown) => (asked.push(query), result) } as unknown as QueryBus;
  return { controller: new AdminUsageController(queryBus), asked };
}

describe('AdminUsageController', () => {
  it('answers every key with dates as ISO strings', async () => {
    const { controller, asked } = controllerAnswering({
      kind: 'usage',
      policy: POLICY,
      features: [
        { featureKey: 'ai.practice', enabled: true, used: '1.000000', total: '10.000000', periodEnd: new Date('2026-12-01T00:00:00.000Z'), limits: {} },
        { featureKey: 'ai.authoring', enabled: false, used: null, total: null, periodEnd: null, limits: {} },
      ],
    });
    expect(await controller.get('workspace', SCHOOL)).toEqual({
      payerType: 'workspace',
      payerId: SCHOOL,
      policy: POLICY,
      features: [
        { feature: 'ai.practice', enabled: true, used: '1.000000', total: '10.000000', periodEnd: '2026-12-01T00:00:00.000Z', limits: {} },
        { feature: 'ai.authoring', enabled: false, used: null, total: null, periodEnd: null, limits: {} },
      ],
    });
    expect(asked).toEqual([new GetPayerUsageQuery('workspace', SCHOOL)]);
  });

  it('is 400 for a payer type that is not billed, 503 when unreadable', async () => {
    await expect(controllerAnswering({ kind: 'unavailable' }).controller.get('platform', SCHOOL)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controllerAnswering({ kind: 'unavailable' }).controller.get('user', SCHOOL)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
