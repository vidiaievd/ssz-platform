import { Inject, Logger, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { fromPersisted as raFromPersisted, TEMPLATE_CODE as READ_ALOUD } from '@ssz/shared-kernel/read-aloud';
import { wordsOf } from '@ssz/shared-kernel/text';
import { SentenceCheckCommand } from './sentence-check.command.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { CONTENT_CLIENT, type IContentClient, ContentClientError } from '../../../../../shared/application/ports/content-client.port.js';
import { PRECHECK_SETTINGS_READER, type IPrecheckSettingsReader } from '../../../../../shared/application/ports/precheck-settings-reader.port.js';
import {
  AI_PRECHECK_CLIENT,
  type AiSentenceCheckOutcome,
  type IAiPrecheckClient,
} from '../../../../../shared/application/ports/ai-precheck-client.port.js';
import { MEDIA_ASSETS, type IMediaAssets } from '../../../../../shared/application/ports/media-assets.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { isTheirs, RecordingRefusal } from '../../services/read-aloud-recordings.js';

export type SentenceCheckError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /** Not a reading aloud. */
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | { code: 'NOT_IN_PROGRESS' }
  /** The prompt is not the exercise's, or the sentence is not in its passage. */
  | { code: 'SENTENCE_NOT_IN_PASSAGE' }
  /** The school has switched its learners' checks off. */
  | { code: 'PRECHECK_NOT_AVAILABLE'; reason: 'disabled' }
  | { code: 'PRECHECK_ACCESS_UNKNOWN' }
  | { code: 'MEDIA_UNAVAILABLE' }
  | RecordingRefusal
  | ContentClientError;

/** The ai-service outcome of the try, or `ai_unavailable` when it did not answer. */
export type SentenceCheckResult = { attemptId: string; itemId: string } & (
  | Extract<AiSentenceCheckOutcome, { status: 'ok' }>
  | Extract<AiSentenceCheckOutcome, { status: 'refused' }>
  | { status: 'failed'; errorCode: string; aiCallIds: string[] }
);

/**
 * One sentence of a reading, heard on its own (plan 86, step 6g): the learner's take of a sentence
 * of a passage, while the attempt is still in progress. Nothing about the attempt moves — no
 * draft, no event, no progress, no card; the model's calls are in ai-service's ledger only.
 *
 * Outside the school's rehearsal limits on purpose (a drill would burn them in a minute): ai-service
 * limits tries per sentence per day. The school's switch still holds — a school that has not
 * switched its learners' checks on gets no drill either. A learner with no school drills on their
 * own plan, which the gate checks.
 *
 * Like a hand-in, the take is checked before its id goes anywhere: this learner's, made for this
 * attempt, finished. The sentence is checked too — it must be words of the prompt's own passage,
 * so the drill cannot be used to have anything else heard.
 */
@CommandHandler(SentenceCheckCommand)
export class SentenceCheckHandler implements ICommandHandler<SentenceCheckCommand> {
  private readonly logger = new Logger(SentenceCheckHandler.name);

  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(PRECHECK_SETTINGS_READER) private readonly settings: IPrecheckSettingsReader,
    @Inject(AI_PRECHECK_CLIENT) private readonly ai: IAiPrecheckClient,
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
  ) {}

  async execute(command: SentenceCheckCommand): Promise<Result<SentenceCheckResult, SentenceCheckError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    if (attempt.userId !== command.userId) return Result.fail({ code: 'FORBIDDEN' });
    if (attempt.templateCode !== READ_ALOUD) return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    if (attempt.status !== 'IN_PROGRESS') return Result.fail({ code: 'NOT_IN_PROGRESS' });

    const definition = await this.contentClient.getExerciseForAttempt(attempt.exerciseId, attempt.targetLanguage, 'PRACTICE');
    if (definition.isFail) return Result.fail(definition.error);
    const { content, expectedAnswers } = definition.value.exercise;
    const prompt = raFromPersisted(content, expectedAnswers).prompts.find((p) => p.id === command.itemId);
    if (!prompt || !isPartOf(command.sentence, prompt.text)) return Result.fail({ code: 'SENTENCE_NOT_IN_PASSAGE' });

    if (attempt.schoolId !== null) {
      let settings;
      try {
        settings = await this.settings.schoolAiPrecheck(attempt.schoolId);
      } catch (err) {
        this.logger.warn(`ai-precheck of school ${attempt.schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
        return Result.fail({ code: 'PRECHECK_ACCESS_UNKNOWN' });
      }
      if (settings === null || !settings.enabled) return Result.fail({ code: 'PRECHECK_NOT_AVAILABLE', reason: 'disabled' });
    }

    if (this.media === null) return Result.fail({ code: 'MEDIA_UNAVAILABLE' });
    const described = await this.media.describe([command.recordingAssetId]);
    if (described.isFail) return Result.fail({ code: 'MEDIA_UNAVAILABLE' });
    const take = described.value.find((a) => a.id === command.recordingAssetId);
    const itemIds = [command.itemId];
    if (!take || !isTheirs(take, attempt)) {
      return Result.fail(new RecordingRefusal('RA_RECORDING_NOT_FOUND', 'A recording could not be found for this attempt', itemIds));
    }
    if (take.status === 'FAILED') {
      return Result.fail(new RecordingRefusal('RA_RECORDING_FAILED', 'A recording was refused when it was uploaded — record it again', itemIds));
    }
    if (take.status === 'PENDING_UPLOAD' || take.durationMs === null) {
      return Result.fail(new RecordingRefusal('RA_RECORDING_NOT_READY', 'A recording has not finished uploading', itemIds));
    }

    const asked = await this.ai.sentenceCheck({
      schoolId: attempt.schoolId,
      userId: attempt.userId,
      exerciseId: attempt.exerciseId,
      language: attempt.targetLanguage,
      explanationLanguage: command.explanationLanguage,
      sentence: command.sentence,
      recordingAssetId: command.recordingAssetId,
    });
    const base = { attemptId: attempt.id, itemId: command.itemId };
    if (asked.isFail) return Result.ok({ ...base, status: 'failed', errorCode: 'ai_unavailable', aiCallIds: [] });
    return Result.ok({ ...base, ...asked.value });
  }
}

/** The sentence's words are a run of the passage's words, case aside — what the drill shows is cut from it. */
function isPartOf(sentence: string, passage: string): boolean {
  const wanted = wordsOf(sentence);
  if (wanted.length === 0) return false;
  const words = wordsOf(passage);
  for (let at = 0; at + wanted.length <= words.length; at++) {
    if (wanted.every((w, k) => words[at + k] === w)) return true;
  }
  return false;
}
