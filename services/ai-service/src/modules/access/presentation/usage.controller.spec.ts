import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import type { MyUsage } from '../application/queries/get-my-usage/get-my-usage.handler.js';
import { GetMyUsageQuery } from '../application/queries/get-my-usage/get-my-usage.query.js';
import { UsageController } from './usage.controller.js';

const USER = { userId: 'c8655ecd-0000-4000-8000-000000000001', roles: ['student'] } as AuthenticatedUser;

function controllerAnswering(result: MyUsage) {
  const asked: unknown[] = [];
  const queryBus = { execute: async (query: unknown) => (asked.push(query), result) } as unknown as QueryBus;
  return { controller: new UsageController(queryBus), asked };
}

describe('UsageController', () => {
  it('answers the contract of plan 83 §3 for the caller', async () => {
    const { controller, asked } = controllerAnswering({
      kind: 'usage',
      usage: { featureKey: 'ai.review_direct', used: '3.000000', total: null, periodEnd: new Date('2026-11-01T00:00:00.000Z') },
    });
    expect(await controller.me({ feature: 'ai.review_direct' }, USER)).toEqual({
      feature: 'ai.review_direct',
      used: '3.000000',
      total: null,
      periodEnd: '2026-11-01T00:00:00.000Z',
    });
    expect(asked).toEqual([new GetMyUsageQuery(USER.userId, 'ai.review_direct')]);
  });

  it('is 404 without the key and 503 when unreadable', async () => {
    await expect(controllerAnswering({ kind: 'not_entitled' }).controller.me({ feature: 'ai.review_direct' }, USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controllerAnswering({ kind: 'unavailable' }).controller.me({ feature: 'ai.review_direct' }, USER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
