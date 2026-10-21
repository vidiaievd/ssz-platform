import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';
import type { ILedgerSpool, SpooledEntry } from '../application/ports/ledger-spool.js';
import type { AiCallRecord } from '../domain/ai-call.js';

// The client adds the `ai:` prefix: the keys are `ai:ledger:spool` and friends.
const SPOOL_KEY = 'ledger:spool';
const DEAD_KEY = 'ledger:spool:dead';
const LOCK_KEY = 'ledger:spool:lock';
/** Long enough for a batch against a slow database; a crashed holder frees it by expiry. */
const LOCK_TTL_MS = 60_000;

/** Deletes the lock only if it is still ours — it may have expired and gone to another instance. */
const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * A Redis list, appended at the tail and drained from the head. Removing the drained head
 * with LTRIM leaves alone whatever other instances appended meanwhile.
 */
@Injectable()
export class RedisLedgerSpool implements ILedgerSpool {
  constructor(private readonly redis: RedisService) {}

  async push(record: AiCallRecord): Promise<void> {
    await this.client().rpush(SPOOL_KEY, serializeRecord(record));
  }

  async drain(limit: number, consume: (entries: SpooledEntry[]) => Promise<number>): Promise<number | null> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return null;

    const token = randomUUID();
    if ((await client.set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') return null;
    try {
      const raws = await client.lrange(SPOOL_KEY, 0, limit - 1);
      if (raws.length === 0) return 0;
      const done = await consume(raws.map((raw) => ({ raw, record: parseRecord(raw) })));
      if (done > 0) await client.ltrim(SPOOL_KEY, done, -1);
      return done;
    } finally {
      await client.eval(RELEASE_LOCK, 1, LOCK_KEY, token).catch(() => undefined);
    }
  }

  async deadLetter(raw: string): Promise<void> {
    await this.client().rpush(DEAD_KEY, raw);
  }

  private client() {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) throw new Error('Redis is unavailable');
    return client;
  }
}

/** JSON with `createdAt` as an ISO string; nothing else in a record is not plain JSON. */
export function serializeRecord(record: AiCallRecord): string {
  return JSON.stringify(record);
}

export function parseRecord(raw: string): AiCallRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<AiCallRecord> & { createdAt?: unknown };
    if (typeof value?.id !== 'string' || typeof value.createdAt !== 'string') return null;
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { ...(value as AiCallRecord), createdAt };
  } catch {
    return null;
  }
}
