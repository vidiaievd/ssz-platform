import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import type { SrsContentType } from '../../domain/entities/review-card.entity.js';
import {
  isSrsTrack,
  trackForContentType,
  type SrsTrack,
} from '../../domain/value-objects/srs-track.js';

/** Content Service's name for a grammar atom in an address. */
const GRAMMAR_RULE_ATOM = 'grammar_rule_atom';

const CACHE_PREFIX = 'srs:atom-track:';
// A day. The track of an atom changes when an author decides that a label is learned
// with the word after all — rare, deliberate, and not urgent: the card the stale answer
// creates charges the wrong budget once, and the next introduction reads the new value.
const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Which budget a card is about to charge — plan 63 phase 6.
 *
 * Only grammar atoms need asking: every other card type settles its own track (see
 * `trackForContentType`), and a word is lexis by definition. The lookup is one call per
 * atom the first time it is seen and a Redis read afterwards, which matters because the
 * fan-out introduces cards inside a message consumer, once per atom per attempt.
 *
 * Unknown answers become `grammar` rather than failing: a rule's label is grammar unless
 * an author has said otherwise, and an attempt must not be nacked because Content Service
 * is slow. The cost of being wrong is one card on the wrong budget.
 */
@Injectable()
export class AtomTrackResolverService {
  private readonly logger = new Logger(AtomTrackResolverService.name);

  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    private readonly redis: RedisService,
  ) {}

  async resolve(contentType: SrsContentType, contentId: string): Promise<SrsTrack> {
    const settled = trackForContentType(contentType);
    if (settled) return settled;

    const cached = await this.readCache(contentId);
    if (cached) return cached;

    const result = await this.contentClient.describeAtoms([
      { atomType: GRAMMAR_RULE_ATOM, atomId: contentId },
    ]);

    if (result.isFail) {
      this.logger.debug(
        `Atom track lookup failed for ${contentId}: ${result.error.message} — assuming grammar`,
      );
      return 'grammar';
    }

    const descriptor = result.value.find((atom) => atom.atomId === contentId);
    const track = isSrsTrack(descriptor?.track) ? descriptor.track : 'grammar';

    // An atom that resolved to nothing is not cached: it has most likely been retired,
    // and the next answer about it should be asked again rather than remembered for a day.
    if (descriptor) await this.writeCache(contentId, track);

    return track;
  }

  private async readCache(atomId: string): Promise<SrsTrack | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    try {
      const raw = await client.get(`${CACHE_PREFIX}${atomId}`);
      return isSrsTrack(raw) ? raw : null;
    } catch (err) {
      this.logger.error(
        `readCache(${atomId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async writeCache(atomId: string, track: SrsTrack): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      await client.set(`${CACHE_PREFIX}${atomId}`, track, 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.error(
        `writeCache(${atomId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
