import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Payer } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import {
  PITCH_TRACKER,
  type IPitchTracker,
  type PitchSpan,
} from '../../../../pronunciation/application/ports/pitch-tracker.js';
import {
  PRONUNCIATION_LEXICON_READER,
  type IPronunciationLexiconReader,
} from '../../../../pronunciation/application/ports/pronunciation-lexicon.reader.js';
import { alignWord, tonemeOfVariants, type LexiconVariant } from '../../../../pronunciation/domain/align-word.js';
import { soundAtomId } from '../../../../pronunciation/domain/sound-remarks.js';
import { hasSoundInventory } from '../../../../pronunciation/domain/sound-inventory.js';
import {
  compareToneme,
  LEARNER_TONEME_BOUNDS,
  melodySpan,
} from '../../../../pronunciation/domain/toneme-comparison.js';
import { measureToneme, POST_TAIL_MS, tonemeWindow } from '../../../../pronunciation/domain/toneme-feature.js';
import { lexicalWords } from '../../../../providers/domain/lexical.js';
import { audible, recordingLevel } from '../../../../providers/domain/recording-level.js';
import { carrierOf, wordAt } from '../../../reference-synthesis/domain/reference-clip.js';
import {
  RECORDING_AUDIO_SOURCE,
  type IRecordingAudioSource,
} from '../../../voice-review/application/ports/recording-audio.source.js';
import type { StoredReference } from '../../domain/stored-reference.js';
import type { TonemeCheckOutcome, TonemeCheckRefusal } from '../../domain/toneme-check.js';
import { TONEME_CHECK } from '../../toneme-check.capability.js';
import { REFERENCE_CLIP_SOURCE, type IReferenceClipSource } from '../ports/reference-clip.source.js';
import { CheckTonemeCommand, type TonemeCheckRequest } from './check-toneme.command.js';

/** Where a toneme check is paid from: a pronunciation drill (plan 88, step 8.3, Q15). */
export const PRONUNCIATION_DRILL_SURFACE = 'pronunciation_drill';

type Refused = Extract<TonemeCheckOutcome, { status: 'refused' }>;
type Failed = Extract<TonemeCheckOutcome, { status: 'failed' }>;

/**
 * A learner's toneme against the reference of the same word (plan 88, step 8.3): the take of the
 * carrier sentence (Q14) heard by Pronunciation Assessment under the payer's `ai.practice`, the
 * word's sounds named by the lexicon, the stressed vowel's F0 measured by the learner's bounds and
 * compared with the reference's stored score (Q16). Both melodies come back whatever the verdict.
 *
 * Everything that costs nothing is checked before the one paid call: the word, the lexicon, the
 * reference, the take and its level. Nothing is written but the ledger — no atom is marked here;
 * the drill marks `nb:tone` after several `other_tone` takes (Q4).
 */
@CommandHandler(CheckTonemeCommand)
export class CheckTonemeHandler implements ICommandHandler<CheckTonemeCommand, TonemeCheckOutcome> {
  private readonly logger = new Logger(CheckTonemeHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    @Inject(PRONUNCIATION_LEXICON_READER) private readonly lexicon: IPronunciationLexiconReader,
    @Inject(PITCH_TRACKER) private readonly pitch: IPitchTracker,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Inject(REFERENCE_CLIP_SOURCE) private readonly references: IReferenceClipSource,
  ) {}

  async execute({ request }: CheckTonemeCommand): Promise<TonemeCheckOutcome> {
    const words = lexicalWords(request.word);
    if (words.length !== 1) return refused('not_a_word');
    const word = words[0]!;
    const carrier = carrierOf(request.language, word);
    if (!carrier || !hasSoundInventory(request.language)) return refused('language_not_supported');

    let variants: LexiconVariant[];
    try {
      variants = (await this.lexicon.variantsOf(request.language, [word])).get(word) ?? [];
    } catch (err) {
      this.logger.warn(`Lexicon unreadable for a toneme of «${word}»: ${messageOf(err)}`);
      return failed('lexicon_unavailable');
    }
    if (variants.length === 0) return refused('not_in_lexicon');
    const tone = tonemeOfVariants(variants);
    if (tone === 'ambiguous') return refused('tone_ambiguous');
    if (tone === null) return refused('no_toneme');

    const reference = await this.reference(request.referenceAssetId, word, tone);
    if ('status' in reference) return reference;
    const take = await this.take(request.recordingAssetId);
    if (!(take instanceof Uint8Array)) return take;

    const context: CallContext = {
      payer: payerOf(request),
      actor: { userId: request.userId, role: 'student' },
      surface: PRONUNCIATION_DRILL_SURFACE,
    };
    const heard = await this.gateway.callSpeech(TONEME_CHECK.code, context, {
      audio: { format: 'wav', data: take },
      referenceText: carrier.sentence,
      language: request.language,
      pronunciation: true,
    });
    const aiCallIds = [heard.recorded.callId];
    if (heard.routed.isFail) return notAnswered(heard.routed.error, aiCallIds);

    const scored = wordAt(heard.routed.value.result.pronunciation?.words ?? [], carrier.wordIndex, word);
    const unheard = (reason: Extract<TonemeCheckOutcome, { status: 'unheard' }>['reason']): TonemeCheckOutcome => ({
      status: 'unheard',
      reason,
      accuracy: scored?.accuracy ?? null,
      aiCallIds,
    });
    if (!scored || scored.phonemes.length === 0) return unheard('word_not_heard');
    const alignment = alignWord({ text: scored.text, error: scored.error, phonemes: scored.phonemes }, variants);
    // The toneme's variant must be what was said: a homograph of another toneme is another word.
    if (alignment.status !== 'aligned' || alignment.tone !== tone) return unheard('sounds_not_aligned');
    const window = tonemeWindow(alignment.sounds, alignment.primaryIndex);
    const learnerSpan = melodySpan(alignment.sounds, alignment.primaryIndex);
    if (!window || !learnerSpan) return unheard('no_toneme_window');

    // Both melodies start at the stressed vowel, as the toneme window does: one span gives the measure too.
    const referenceSpan: PitchSpan = {
      startMs: reference.stored.stressedVowel.startMs,
      endMs: reference.stored.wordSpan.endMs + POST_TAIL_MS,
    };
    let learnerCurves, referenceCurves;
    try {
      [learnerCurves, referenceCurves] = await Promise.all([
        this.pitch.track(Buffer.from(take), [learnerSpan]),
        this.pitch.track(Buffer.from(reference.wav), [referenceSpan]),
      ]);
    } catch (err) {
      this.logger.warn(`Pitch of a take of «${word}» not tracked: ${messageOf(err)}`);
      return failed('pitch_unavailable', aiCallIds);
    }
    const learnerCurve = learnerCurves.curves[0]!;
    const learner = measureToneme(learnerCurve, learnerCurves.stepMs, window, LEARNER_TONEME_BOUNDS);
    const comparison = compareToneme({ tone, learner, referenceScore: reference.stored.score });

    return {
      status: 'ok',
      word,
      sentence: carrier.sentence,
      accuracy: scored.accuracy,
      comparison,
      melody: {
        stepMs: learnerCurves.stepMs,
        learner: learnerCurve.points,
        reference: referenceCurves.curves[0]!.points,
      },
      atomRef:
        comparison.verdict.kind === 'other_tone'
          ? { atomType: 'sound', atomId: soundAtomId(request.language, 'tone') }
          : null,
      aiCallIds,
    };
  }

  /** The word's reference and its stored check; a refusal or failure when there is none to compare with. */
  private async reference(
    assetId: string,
    word: string,
    tone: 1 | 2,
  ): Promise<{ wav: Uint8Array; stored: StoredReference } | Refused | Failed> {
    let clip;
    try {
      clip = await this.references.fetch(assetId);
    } catch (err) {
      this.logger.warn(`Reference ${assetId} unreadable: ${messageOf(err)}`);
      return failed('reference_unreadable');
    }
    switch (clip.kind) {
      case 'ready':
        // A clip of another word, or kept for a toneme the lexicon no longer gives the word.
        if (clip.reference.word !== word || clip.reference.tone !== tone) return refused('not_a_reference');
        return { wav: clip.wav, stored: clip.reference };
      case 'pending':
        return failed('reference_not_ready');
      case 'missing':
        return failed('reference_missing');
      default:
        return refused(clip.kind);
    }
  }

  /** The learner's take as a speech model hears it, unless missing, not ready or too quiet to be heard. */
  private async take(assetId: string): Promise<Uint8Array | Failed> {
    let audio;
    try {
      audio = await this.recordings.fetch(assetId);
    } catch (err) {
      this.logger.warn(`Take ${assetId} unreadable: ${messageOf(err)}`);
      return failed('recording_unreadable');
    }
    if (audio.kind === 'missing') return failed('recording_missing');
    if (audio.kind === 'pending') return failed('recording_not_ready');
    const level = recordingLevel(audio.wav);
    if (!audible(level)) {
      this.logger.warn(
        `Take ${assetId} inaudible: voice ${level!.speechDb} dBFS, ${level!.contrastDb} dB over its noise`,
      );
      return failed('recording_inaudible');
    }
    return audio.wav;
  }
}

/** The school when there is one (Q15), else the learner under their own plan. */
function payerOf(request: TonemeCheckRequest): Payer {
  return request.schoolId === null ? { type: 'user', id: request.userId } : { type: 'workspace', id: request.schoolId };
}

function refused(reason: TonemeCheckRefusal): Refused {
  return { status: 'refused', reason };
}

function failed(errorCode: string, aiCallIds: string[] = []): Failed {
  return { status: 'failed', errorCode, aiCallIds };
}

/** A call that reached no usable answer: refused on purpose, or failed — as a rehearsal maps it. */
function notAnswered<R>(failure: GatewayFailureOf<R>, aiCallIds: string[]): Refused | Failed {
  switch (failure.kind) {
    case 'disabled':
      return refused('not_available');
    case 'refused':
      return refused(failure.code === 'quota_exhausted' ? 'pool_empty' : 'not_available');
    case 'gate_unavailable':
    case 'unavailable':
      return failed(failure.kind, aiCallIds);
    case 'error':
      return failed(failure.error.code, aiCallIds);
  }
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));
