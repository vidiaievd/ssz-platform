import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { ISentenceCheckLimiter, SentenceCheckDecision } from '../application/ports/sentence-check.limiter.js';

// The client adds the `ai:` prefix: `ai:sentence:rl:<userId>:<sentence hash>`.
const NAMESPACE = 'sentence:rl:';
const DAY_MS = 86_400_000;

// Count the try; a new key lives until the end of the UTC day.
const TAKE = `local n = redis.call('incr', KEYS[1])
if n == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
local ttl = redis.call('pttl', KEYS[1])
if ttl < 0 then redis.call('pexpire', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { n, ttl }`;

/** Fails open like the other limiters here: with Redis away the gate's quota still holds the spend. */
@Injectable()
export class RedisSentenceCheckLimiter implements ISentenceCheckLimiter {
  private readonly logger = new Logger(RedisSentenceCheckLimiter.name);
  private readonly limit: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.limit = config.get<number>('sentenceCheckDailyLimit')!;
  }

  async take(userId: string, sentence: string): Promise<SentenceCheckDecision> {
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) return { allowed: true };
    const hash = createHash('sha1').update(sentence.trim().toLowerCase()).digest('hex').slice(0, 16);
    const untilMidnight = DAY_MS - (Date.now() % DAY_MS);
    try {
      const [count, ttl] = (await client.eval(TAKE, 1, `${NAMESPACE}${userId}:${hash}`, untilMidnight)) as [number, number];
      return count <= this.limit ? { allowed: true } : { allowed: false, retryAfterMs: ttl };
    } catch (err) {
      this.logger.warn(`Sentence limit not checked for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
      return { allowed: true };
    }
  }
}
