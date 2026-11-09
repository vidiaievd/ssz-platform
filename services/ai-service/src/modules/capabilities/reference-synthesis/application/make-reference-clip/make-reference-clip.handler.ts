import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PLATFORM_PAYER } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayCallOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { PITCH_TRACKER, type IPitchTracker } from '../../../../pronunciation/application/ports/pitch-tracker.js';
import {
  PRONUNCIATION_LEXICON_READER,
  type IPronunciationLexiconReader,
} from '../../../../pronunciation/application/ports/pronunciation-lexicon.reader.js';
import { alignWord, type LexiconVariant } from '../../../../pronunciation/domain/align-word.js';
import { measureToneme, tonemeWindow } from '../../../../pronunciation/domain/toneme-feature.js';
import type { SynthesisResult } from '../../../../providers/domain/synthesis-result.js';
import {
  MIN_WORD_ACCURACY,
  referenceToneOf,
  referenceWordOf,
  wordAt,
  type Carrier,
  type ReferenceClip,
  type ReferenceClipOutcome,
  type ReferenceTry,
} from '../../domain/reference-clip.js';
import { REFERENCE_CHECK, REFERENCE_SYNTHESIS } from '../../reference-synthesis.capability.js';
import { MakeReferenceClipCommand } from './make-reference-clip.command.js';

/** Where a reference clip is paid from: the platform, for course material (Q13). */
export const REFERENCE_SURFACE = 'authoring';

const CONTEXT: CallContext = { payer: PLATFORM_PAYER, actor: null, surface: REFERENCE_SURFACE };

/** A voice tried: the clip kept, or why not. A failure of a model or the tracker stops the word. */
type Tried =
  | { kind: 'kept'; clip: ReferenceClip; try: ReferenceTry }
  | { kind: 'not_kept'; try: ReferenceTry }
  | { kind: 'failed'; errorCode: string };

/**
 * A reference clip of a word, self-checked (plan 88, step 6b.2): the word in a carrier sentence
 * is synthesized voice by voice, heard back by Pronunciation Assessment, named by the lexicon
 * (`alignWord`), and its stressed vowel's F0 measured against the lexicon's toneme (§0.5c). The
 * first clip that agrees is kept; a word whose variants differ in toneme is not synthesized at
 * all. The platform pays every call.
 */
@CommandHandler(MakeReferenceClipCommand)
export class MakeReferenceClipHandler implements ICommandHandler<MakeReferenceClipCommand, ReferenceClipOutcome> {
  private readonly logger = new Logger(MakeReferenceClipHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    @Inject(PRONUNCIATION_LEXICON_READER) private readonly lexicon: IPronunciationLexiconReader,
    @Inject(PITCH_TRACKER) private readonly pitch: IPitchTracker,
  ) {}

  async execute({ request }: MakeReferenceClipCommand): Promise<ReferenceClipOutcome> {
    const named = referenceWordOf(request.language, request.word);
    if ('refusal' in named) return { status: 'refused', reason: named.refusal };
    const { word, carrier } = named;

    let variants: LexiconVariant[];
    try {
      variants = (await this.lexicon.variantsOf(request.language, [word])).get(word) ?? [];
    } catch (err) {
      this.logger.warn(
        `Lexicon unreadable for a reference of «${word}»: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'failed', errorCode: 'lexicon_unavailable', tries: [], aiCallIds: [] };
    }
    const toned = referenceToneOf(variants);
    if ('refusal' in toned) return { status: 'refused', reason: toned.refusal };
    const { tone } = toned;

    const voices = await this.gateway.voicesOf(REFERENCE_SYNTHESIS.code, request.language);
    if (voices.length === 0) return { status: 'refused', reason: 'not_available' };

    const tries: ReferenceTry[] = [];
    const aiCallIds: string[] = [];
    for (const voice of voices) {
      const tried = await this.tryVoice(request.language, word, carrier, variants, tone, voice, aiCallIds);
      if (tried.kind === 'failed') {
        return tried.errorCode === 'disabled'
          ? { status: 'refused', reason: 'not_available' }
          : { status: 'failed', errorCode: tried.errorCode, tries, aiCallIds };
      }
      tries.push(tried.try);
      if (tried.kind === 'kept') return { status: 'ok', clip: tried.clip, tone, tries, aiCallIds };
    }
    return { status: 'rejected', tone, tries, aiCallIds };
  }

  private async tryVoice(
    language: string,
    word: string,
    carrier: Carrier,
    variants: LexiconVariant[],
    tone: 1 | 2 | null,
    voice: string,
    aiCallIds: string[],
  ): Promise<Tried> {
    const spoken = await this.gateway.callSynthesis(REFERENCE_SYNTHESIS.code, CONTEXT, {
      text: carrier.sentence,
      language,
      voice,
    });
    aiCallIds.push(spoken.recorded.callId);
    if (spoken.routed.isFail) return { kind: 'failed', errorCode: failureCode(spoken) };
    const clip = spoken.routed.value.result;

    const heard = await this.gateway.callSpeech(REFERENCE_CHECK.code, CONTEXT, {
      audio: clip.audio,
      referenceText: carrier.sentence,
      language,
      pronunciation: true,
    });
    aiCallIds.push(heard.recorded.callId);
    if (heard.routed.isFail) return { kind: 'failed', errorCode: failureCode(heard) };

    const notKept = (
      outcome: ReferenceTry['outcome'],
      accuracy: number | null,
      measure: ReferenceTry['measure'] = null,
    ): Tried => ({
      kind: 'not_kept',
      try: { voice: clip.voice, outcome, accuracy, measure },
    });
    const scored = wordAt(heard.routed.value.result.pronunciation?.words ?? [], carrier.wordIndex, word);
    if (!scored || scored.accuracy < MIN_WORD_ACCURACY || scored.phonemes.length === 0) {
      return notKept('not_heard', scored?.accuracy ?? null);
    }
    const alignment = alignWord({ text: scored.text, error: scored.error, phonemes: scored.phonemes }, variants);
    // The variants the sounds fit must be the toneme's: «finger» heard as the verb's imperative is another word.
    if (alignment.status !== 'aligned' || alignment.tone !== tone) return notKept('not_aligned', scored.accuracy);

    const first = alignment.sounds[0]!;
    const last = alignment.sounds[alignment.sounds.length - 1]!;
    const wordSpan = { startMs: first.startMs, endMs: last.startMs + last.durationMs };
    const kept = (measure: ReferenceTry['measure'], stressedVowel: ReferenceClip['stressedVowel']): Tried => ({
      kind: 'kept',
      clip: { ...clipOf(clip, carrier), word: wordSpan, stressedVowel },
      try: { voice: clip.voice, outcome: 'kept', accuracy: scored.accuracy, measure },
    });
    if (tone === null) return kept(null, null);

    const window = tonemeWindow(alignment.sounds, alignment.primaryIndex);
    if (!window) return notKept('not_measured', scored.accuracy);
    let measure;
    try {
      const curves = await this.pitch.track(Buffer.from(clip.audio.data), [window.span]);
      measure = measureToneme(curves.curves[0]!, curves.stepMs, window);
    } catch (err) {
      this.logger.warn(
        `Pitch of a reference of «${word}» not tracked: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { kind: 'failed', errorCode: 'pitch_unavailable' };
    }
    if (!measure) return notKept('not_measured', scored.accuracy);
    if (measure.tone === null) return notKept('tone_unsure', scored.accuracy, measure);
    if (measure.tone !== tone) return notKept('tone_mismatch', scored.accuracy, measure);

    const vowel = alignment.sounds[alignment.primaryIndex!]!;
    return kept(measure, { startMs: vowel.startMs, endMs: vowel.startMs + vowel.durationMs });
  }
}

function clipOf(result: SynthesisResult, carrier: Carrier): Omit<ReferenceClip, 'word' | 'stressedVowel'> {
  return { audio: result.audio.data, audioMs: result.audioMs, voice: result.voice, sentence: carrier.sentence };
}

/** `disabled` for a switched-off capability; else the provider's code or the route's kind. */
function failureCode(call: GatewayCallOf<unknown>): string {
  if (call.routed.isOk) return 'ok';
  const failure = call.routed.error;
  if (failure.kind === 'disabled') return 'disabled';
  if (failure.kind === 'error') return failure.error.code;
  return failure.kind === 'refused' ? failure.code : failure.kind;
}
