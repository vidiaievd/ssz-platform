import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';
import type { IQuotaCounter } from '../application/ports/quota-counter.js';
import { BILLED_PAYER_TYPES, type BilledPayerType } from '../domain/payer.js';
import type { QuotaKey } from '../domain/quota.js';

// The client adds the `ai:` prefix: `ai:quota:<payerType>:<payerId>:<capability>:<periodStart>:<periodEnd>`
// (period bounds as epoch ms). The period end is in the key so the reconciler can rebuild it.
const NAMESPACE = 'quota:';
/** Counters outlive their period by this much, so a late reconcile still finds them. */
const AFTER_PERIOD_MS = 35 * 24 * 3600_000;

const INIT = `if redis.call('exists', KEYS[1]) == 0 then redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2]) end
return redis.call('get', KEYS[1])`;
const CHARGE = `if redis.call('exists', KEYS[1]) == 1 then return redis.call('incrby', KEYS[1], ARGV[1]) end return false`;
const RAISE = `local v = redis.call('get', KEYS[1])
if v and tonumber(v) < tonumber(ARGV[1]) then redis.call('set', KEYS[1], ARGV[1], 'KEEPTTL') return 1 end return 0`;
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

@Injectable()
export class RedisQuotaCounter implements IQuotaCounter {
  private readonly prefix: string;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.prefix = config.get<AppConfig['redis']>('redis')?.keyPrefix ?? '';
  }

  async get(key: QuotaKey): Promise<bigint | null> {
    const value = await this.client().get(keyOf(key));
    return value === null ? null : BigInt(value);
  }

  async init(key: QuotaKey, spent: bigint): Promise<bigint> {
    const ttl = Math.max(key.periodEnd.getTime() + AFTER_PERIOD_MS - Date.now(), 60_000);
    const value = (await this.client().eval(INIT, 1, keyOf(key), spent.toString(), ttl)) as string;
    return BigInt(value);
  }

  async charge(key: QuotaKey, micro: bigint): Promise<void> {
    await this.client().eval(CHARGE, 1, keyOf(key), micro.toString());
  }

  async *list(): AsyncIterable<{ key: QuotaKey; value: bigint }> {
    const client = this.client();
    // SCAN patterns and results carry the raw key: the client prefix is not applied to them.
    const stream = client.scanStream({ match: `${this.prefix}${NAMESPACE}*`, count: 200 });
    for await (const batch of stream as AsyncIterable<string[]>) {
      for (const raw of batch) {
        const key = parseKey(raw.slice(this.prefix.length));
        if (!key) continue;
        const value = await client.get(keyOf(key));
        if (value !== null) yield { key, value: BigInt(value) };
      }
    }
  }

  async raiseTo(key: QuotaKey, spent: bigint): Promise<void> {
    await this.client().eval(RAISE, 1, keyOf(key), spent.toString());
  }

  async tryLock(name: string, ttlMs: number): Promise<{ release(): Promise<void> } | null> {
    const client = this.client();
    const lockKey = `${NAMESPACE}lock:${name}`;
    const token = randomUUID();
    if ((await client.set(lockKey, token, 'PX', ttlMs, 'NX')) !== 'OK') return null;
    return { release: async () => void (await client.eval(RELEASE, 1, lockKey, token).catch(() => undefined)) };
  }

  private client() {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) throw new Error('Redis is unavailable');
    return client;
  }
}

export function keyOf(key: QuotaKey): string {
  return `${NAMESPACE}${key.payer.type}:${key.payer.id}:${key.capability}:${key.periodStart.getTime()}:${key.periodEnd.getTime()}`;
}

/** Null for anything that is not a counter key (the lock, a foreign key). */
export function parseKey(key: string): QuotaKey | null {
  if (!key.startsWith(NAMESPACE)) return null;
  const parts = key.slice(NAMESPACE.length).split(':');
  if (parts.length !== 5) return null;
  const [type, id, capability, start, end] = parts as [string, string, string, string, string];
  if (!(BILLED_PAYER_TYPES as readonly string[]).includes(type) || !/^\d+$/.test(start) || !/^\d+$/.test(end)) return null;
  return {
    payer: { type: type as BilledPayerType, id },
    capability,
    periodStart: new Date(Number(start)),
    periodEnd: new Date(Number(end)),
  };
}
