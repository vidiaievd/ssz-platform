import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { toNarrationScript, narrationSpeakers } from '@ssz/shared-kernel/narration';
import { assignSpeakerVoices } from '../../../domain/speaker-voices.js';
import { Queue } from 'bullmq';

import type { AppConfig } from '../../../../../config/configuration.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { QUEUE_SPEECH_SYNTHESIS } from '../../../../../infrastructure/queues/queue-names.js';
import { VOICE_RESOLVER } from '../../../../../shared/application/ports/speech-synthesizer.port.js';
import type { IVoiceResolver } from '../../../../../shared/application/ports/speech-synthesizer.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { defaultNarrationStyle, resolveNarrationStyle } from '../../../domain/narration-style.js';
import { MediaAssetEntity } from '../../../../assets/domain/entities/media-asset.entity.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../../assets/domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../../assets/domain/repositories/media-asset.repository.interface.js';
import type { NarrationJobData } from '../../narration-job.js';
import { RequestNarrationCommand, type RequestNarrationOutcome } from './request-narration.command.js';

/**
 * The size a narration asset is created with. A synthesizer knows the length only after
 * speaking, so the real size replaces this in `attachSynthesis`; until then the asset is
 * PENDING_UPLOAD and nobody reads its bytes.
 */
const SIZE_UNTIL_SPOKEN = 1;

/**
 * Accept a narration and queue it (plan 74, phase 2). The script is built and checked here,
 * so a body that has nothing to say or is too long is refused synchronously; the asset id is
 * returned at once and the author's editor waits for READY like for any upload.
 */
@CommandHandler(RequestNarrationCommand)
export class RequestNarrationHandler implements ICommandHandler<RequestNarrationCommand, RequestNarrationOutcome> {
  private readonly logger = new Logger(RequestNarrationHandler.name);

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(VOICE_RESOLVER) private readonly voices: IVoiceResolver,
    @InjectQueue(QUEUE_SPEECH_SYNTHESIS) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async execute(command: RequestNarrationCommand): Promise<RequestNarrationOutcome> {
    const script = toNarrationScript(command.bodyMarkdown, command.lang);
    if (script.segments.length === 0) return Result.fail('EMPTY_TEXT');

    const characters = script.segments.reduce((sum, segment) => sum + segment.text.length, 0);
    if (characters > this.config.get<AppConfig['tts']>('tts')!.narrationMaxChars) {
      return Result.fail('TEXT_TOO_LONG');
    }

    const narrator = command.voiceId ? this.voices.byId(command.lang, command.voiceId) : this.voices.resolve(command.lang, null);
    if (!narrator) return Result.fail(command.voiceId && this.voices.resolve(command.lang, null) ? 'VOICE_NOT_AVAILABLE' : 'LANGUAGE_NOT_SUPPORTED');

    const speakerVoices = assignSpeakerVoices(
      narrationSpeakers(script.segments),
      narrator.id,
      this.voices.list(command.lang),
      command.speakerVoices,
    );

    const tts = this.config.get<AppConfig['tts']>('tts')!;
    const style = resolveNarrationStyle(
      { lengthScale: command.lengthScale, pauseScale: command.pauseScale },
      defaultNarrationStyle(command.level, tts.narrationLengthScale),
    );

    const upload = this.config.get<AppConfig['upload']>('upload')!;
    const created = MediaAssetEntity.create({
      ownerId: command.ownerId,
      mimeType: 'audio/mpeg',
      sizeBytes: SIZE_UNTIL_SPOKEN,
      originalFilename: fileNameOf(command.label),
      entityType: 'lesson_asset',
      entityId: command.lessonId ?? undefined,
      origin: 'SYNTHESIZED',
      sizeLimits: {
        maxImageSizeBytes: upload.maxImageSizeBytes,
        maxAudioSizeBytes: upload.maxAudioSizeBytes,
        maxVideoSizeBytes: upload.maxVideoSizeBytes,
      },
    });
    if (created.isFail) return Result.fail(created.error);

    const asset = created.value;
    await this.assetRepo.save(asset);

    const job = await this.prisma.processingJob.create({
      data: { assetId: asset.id, type: 'SPEECH_SYNTHESIS', status: 'PENDING' },
    });
    const data: NarrationJobData = {
      assetId: asset.id,
      jobId: job.id,
      ownerId: command.ownerId,
      lang: command.lang,
      segments: script.segments,
      textHash: script.textHash,
      lengthScale: style.lengthScale,
      pauseScale: style.pauseScale,
      level: command.level,
      voiceId: narrator.id,
      speakerVoices,
    };
    // One attempt: a failed narration turns FAILED and the author asks again, rather than
    // the queue retrying a minute of speech against a synthesizer that is down.
    await this.queue.add('SPEECH_SYNTHESIS', data, {
      jobId: job.id,
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: false,
    });

    this.logger.log(
      `Queued narration [${job.id}] for asset ${asset.id}: ${script.segments.length} segments, ${characters} chars`,
    );

    return Result.ok({
      assetId: asset.id,
      status: asset.status,
      voice: narrator.voice,
      voiceId: narrator.id,
      textHash: script.textHash,
      lengthScale: style.lengthScale,
      pauseScale: style.pauseScale,
      segments: script.segments.length,
      characters,
      speakerVoices,
    });
  }
}

/** `Les teksten — 2D` → `les-teksten-2d.mp3`; the storage key sanitizes it once more. */
function fileNameOf(label: string | null): string {
  const slug = (label ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'narration'}.mp3`;
}
