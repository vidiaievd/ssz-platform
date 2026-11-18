import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PLATFORM_PAYER } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayCallOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { lexicalWords } from '../../../../providers/domain/lexical.js';
import { MIN_WORD_ACCURACY, wordAt } from '../../domain/reference-clip.js';
import type { WordClipOutcome } from '../../domain/word-clip.js';
import { REFERENCE_CHECK, REFERENCE_SYNTHESIS } from '../../reference-synthesis.capability.js';
import { REFERENCE_SURFACE } from '../make-reference-clip/make-reference-clip.handler.js';
import { MakeWordClipCommand } from './make-word-clip.command.js';

const CONTEXT: CallContext = { payer: PLATFORM_PAYER, actor: null, surface: REFERENCE_SURFACE };

/**
 * A word spoken alone by the voice asked for (plan 86, step 4z.2): synthesized through
 * `reference_synthesis` and heard back through `reference_check`, both paid by the platform like
 * a reference clip. Kept when Azure hears the word asked for at `MIN_WORD_ACCURACY` or better;
 * nothing about its sounds or toneme is checked — that is the kernel pack's `checkedVoices`.
 */
@CommandHandler(MakeWordClipCommand)
export class MakeWordClipHandler implements ICommandHandler<MakeWordClipCommand, WordClipOutcome> {
  constructor(private readonly gateway: AiGateway) {}

  async execute({ request }: MakeWordClipCommand): Promise<WordClipOutcome> {
    const words = lexicalWords(request.word);
    if (words.length !== 1) return { status: 'refused', reason: 'not_a_word' };
    const word = words[0]!;

    const voices = await this.gateway.voicesOf(REFERENCE_SYNTHESIS.code, request.language);
    if (!voices.includes(request.voice)) return { status: 'refused', reason: 'not_available' };

    const aiCallIds: string[] = [];
    const spoken = await this.gateway.callSynthesis(REFERENCE_SYNTHESIS.code, CONTEXT, {
      text: word,
      language: request.language,
      voice: request.voice,
    });
    aiCallIds.push(spoken.recorded.callId);
    if (spoken.routed.isFail) return outcomeOfFailure(spoken, aiCallIds);
    const clip = spoken.routed.value.result;

    const heard = await this.gateway.callSpeech(REFERENCE_CHECK.code, CONTEXT, {
      audio: clip.audio,
      referenceText: word,
      language: request.language,
      pronunciation: true,
    });
    aiCallIds.push(heard.recorded.callId);
    if (heard.routed.isFail) return outcomeOfFailure(heard, aiCallIds);

    const scored = wordAt(heard.routed.value.result.pronunciation?.words ?? [], 0, word);
    if (!scored || scored.accuracy < MIN_WORD_ACCURACY) {
      return { status: 'rejected', voice: clip.voice, accuracy: scored?.accuracy ?? null, aiCallIds };
    }
    return {
      status: 'ok',
      clip: { audio: clip.audio.data, audioMs: clip.audioMs, voice: clip.voice, accuracy: scored.accuracy },
      aiCallIds,
    };
  }
}

/** A switched-off capability is `not_available`, as for a reference; any other failure is `failed`. */
function outcomeOfFailure(call: GatewayCallOf<unknown>, aiCallIds: string[]): WordClipOutcome {
  if (call.routed.isOk) throw new Error('not a failure');
  const failure = call.routed.error;
  if (failure.kind === 'disabled') return { status: 'refused', reason: 'not_available' };
  const errorCode =
    failure.kind === 'error' ? failure.error.code : failure.kind === 'refused' ? failure.code : failure.kind;
  return { status: 'failed', errorCode, aiCallIds };
}
