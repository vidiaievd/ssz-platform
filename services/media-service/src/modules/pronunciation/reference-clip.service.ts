import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { toNarrationScript } from '@ssz/shared-kernel/narration';

import { RequestUploadCommand } from '../assets/application/commands/request-upload/request-upload.command.js';
import type { RequestUploadResult } from '../assets/application/commands/request-upload/request-upload.command.js';
import { StoreSynthesizedAudioCommand } from '../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type { StoreSynthesizedAudioResult } from '../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type {
  MediaAssetEntity,
  ReferenceCheck,
} from '../assets/domain/entities/media-asset.entity.js';
import type { MediaAssetDomainError } from '../assets/domain/exceptions/media-asset.exceptions.js';
import {
  PLATFORM_OWNER_ID,
  REFERENCE_CLIP,
  referenceClipKey,
} from '../assets/domain/policies/reference-clip-policy.js';
import { MEDIA_ASSET_REPOSITORY } from '../assets/domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../assets/domain/repositories/media-asset.repository.interface.js';
import { CACHE_SERVICE } from '../../shared/application/ports/cache.port.js';
import type { ICacheService } from '../../shared/application/ports/cache.port.js';
import { REFERENCE_SYNTHESIZER } from '../../shared/application/ports/reference-synthesizer.port.js';
import type {
  IReferenceSynthesizer,
  ReferenceClipAudio,
} from '../../shared/application/ports/reference-synthesizer.port.js';
import { Result } from '../../shared/kernel/result.js';

/**
 * Why no clip: what ai-service refused (`NOT_A_WORD`, `LANGUAGE_NOT_SUPPORTED`, `NOT_IN_LEXICON`,
 * `TONE_AMBIGUOUS`, `NOT_AVAILABLE`), `REFERENCE_REJECTED` when no voice passed the check,
 * `SYNTHESIS_FAILED` when ai-service could not answer, `ASSET_REJECTED` when the clip could not be stored.
 */
export type ReferenceClipError =
  | 'EMPTY_TEXT'
  | 'NOT_A_WORD'
  | 'LANGUAGE_NOT_SUPPORTED'
  | 'NOT_IN_LEXICON'
  | 'TONE_AMBIGUOUS'
  | 'NOT_AVAILABLE'
  | 'REFERENCE_REJECTED'
  | 'SYNTHESIS_FAILED'
  | 'ASSET_REJECTED';

export interface ReferenceClip {
  assetId: string;
  voice: string;
  tone: 1 | 2 | null;
  sentence: string;
  word: { startMs: number; endMs: number };
  stressedVowel: { startMs: number; endMs: number } | null;
  /** False when this request is what made the clip. */
  cached: boolean;
}

/** A word nothing can be made for stays so: the lexicon and the voices change rarely. */
const VERDICT_TTL_SECONDS = 30 * 24 * 3600;
const verdictKey = (key: string): string => `reference:verdict:${key}`;

/** Statuses of a clip that was stored: a half-written one (PENDING_UPLOAD) is swept as abandoned. */
const STORED = new Set(['UPLOADED', 'PROCESSING', 'READY']);

const REFUSALS: Record<string, ReferenceClipError> = {
  not_a_word: 'NOT_A_WORD',
  language_not_supported: 'LANGUAGE_NOT_SUPPORTED',
  not_in_lexicon: 'NOT_IN_LEXICON',
  tone_ambiguous: 'TONE_AMBIGUOUS',
  not_available: 'NOT_AVAILABLE',
};

/**
 * A reference word for the whole platform (plan 88, step 6b.3, Q10, Q13): asked of ai-service's
 * self-checked synthesis once, kept as a `reference_clip` asset of the platform for good, and
 * served from it afterwards. What the check found sits in the asset's `synthesis.reference`. A
 * word that cannot get one (refused, rejected) is remembered for a while rather than paid for
 * again on every ask; `NOT_AVAILABLE` and failures are not — they pass.
 */
@Injectable()
export class ReferenceClipService {
  private readonly logger = new Logger(ReferenceClipService.name);
  private readonly inFlight = new Map<string, Promise<Result<ReferenceClip, ReferenceClipError>>>();

  constructor(
    @Inject(REFERENCE_SYNTHESIZER) private readonly synthesizer: IReferenceSynthesizer,
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: IMediaAssetRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly commandBus: CommandBus,
  ) {}

  async getOrCreate(
    rawWord: string,
    lang: string,
  ): Promise<Result<ReferenceClip, ReferenceClipError>> {
    const word = rawWord.trim();
    if (word.length === 0) return Result.fail('EMPTY_TEXT');
    if (/\s/.test(word)) return Result.fail('NOT_A_WORD');
    const key = referenceClipKey(lang, word);

    const stored = await this.find(key);
    if (stored) return Result.ok(stored);
    const verdict = await this.cache.get<ReferenceClipError>(verdictKey(key));
    if (verdict) return Result.fail(verdict);

    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const work = this.make(word, lang, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  private async find(key: string): Promise<ReferenceClip | null> {
    const found = await this.assets.findMany({
      ownerId: PLATFORM_OWNER_ID,
      entityType: REFERENCE_CLIP,
      entityId: key,
      limit: 10,
    });
    const asset = found.find((a) => STORED.has(a.status) && a.synthesis?.reference);
    return asset ? toClip(asset, true) : null;
  }

  private async make(
    word: string,
    lang: string,
    key: string,
  ): Promise<Result<ReferenceClip, ReferenceClipError>> {
    let made;
    try {
      made = await this.synthesizer.reference(word, lang);
    } catch (e) {
      this.logger.error(`Reference clip for "${word}" (${lang}) not made: ${String(e)}`);
      return Result.fail('SYNTHESIS_FAILED');
    }

    if (made.status !== 'ok') {
      const error =
        made.status === 'rejected'
          ? 'REFERENCE_REJECTED'
          : (REFUSALS[made.reason] ?? 'NOT_AVAILABLE');
      if (error !== 'NOT_AVAILABLE')
        await this.cache.set(verdictKey(key), error, VERDICT_TTL_SECONDS);
      return Result.fail(error);
    }

    const reference: ReferenceCheck = {
      word,
      sentence: made.clip.sentence,
      tone: made.tone,
      wordSpan: made.clip.word,
      stressedVowel: made.clip.stressedVowel,
      tries: made.tries,
    };
    const assetId = await this.store(made.clip, lang, key, reference);
    if (!assetId) return Result.fail('ASSET_REJECTED');
    this.logger.log(
      `Reference clip for "${word}" (${lang}) kept: ${made.clip.voice}, toneme ${made.tone ?? '–'}`,
    );
    return Result.ok({
      assetId,
      voice: made.clip.voice,
      tone: made.tone,
      sentence: made.clip.sentence,
      word: made.clip.word,
      stressedVowel: made.clip.stressedVowel,
      cached: false,
    });
  }

  /** The WAV as a SYNTHESIZED asset of the platform, finalized like an upload; null when refused. */
  private async store(
    clip: ReferenceClipAudio,
    lang: string,
    key: string,
    reference: ReferenceCheck,
  ): Promise<string | null> {
    const requested: Result<RequestUploadResult, MediaAssetDomainError> =
      await this.commandBus.execute(
        new RequestUploadCommand(
          PLATFORM_OWNER_ID,
          'audio/wav',
          BigInt(clip.wav.length),
          'reference.wav',
          REFERENCE_CLIP,
          key,
          'SYNTHESIZED',
        ),
      );
    if (requested.isFail) return null;

    const stored: StoreSynthesizedAudioResult = await this.commandBus.execute(
      new StoreSynthesizedAudioCommand(
        requested.value.assetId,
        PLATFORM_OWNER_ID,
        clip.wav,
        'audio/wav',
        {
          provider: this.synthesizer.provider,
          voice: clip.voice,
          lang,
          textHash: toNarrationScript(clip.sentence, lang).textHash,
          segments: 1,
          reference,
        },
      ),
    );
    return stored.isFail ? null : requested.value.assetId;
  }
}

function toClip(asset: MediaAssetEntity, cached: boolean): ReferenceClip {
  const reference = asset.synthesis!.reference!;
  return {
    assetId: asset.id,
    voice: asset.synthesis!.voice,
    tone: reference.tone,
    sentence: reference.sentence,
    word: reference.wordSpan,
    stressedVowel: reference.stressedVowel,
    cached,
  };
}
