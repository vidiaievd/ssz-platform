import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Payer } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { languageName } from '../../../review-draft/domain/comment-language.js';
import { readPhraseMarks, type PhraseMarks } from '../../domain/phrase-marks.js';
import { PROSODY_MARKUP } from '../../prosody-markup.capability.js';
import { prosodyMarkupRequest } from '../../prompts/prompts.js';
import { SuggestPhraseMarksCommand, type SuggestPhraseMarksRequest } from './suggest-phrase-marks.command.js';

/** Where an author's AI calls come from — the platform's own reference clips share it. */
export const AUTHORING_SURFACE = 'authoring';

/** The languages the prompt's rules are written for (plan 86: Norwegian only). */
export const PROSODY_MARKUP_LANGUAGES: ReadonlySet<string> = new Set(['nb']);

/**
 * At most this many words in one call: a long lesson body, with room for the answer in the
 * binding's output. A longer text is refused, not cut — half a layer reads as a finished one.
 */
export const MAX_MARKUP_WORDS = 1_500;

/**
 * Why no suggestion was made, on purpose:
 * - `language_not_supported` — not a language the rules are written for;
 * - `no_words` — nothing to mark;
 * - `too_long` — over `MAX_MARKUP_WORDS`;
 * - `not_available` — the agent is off, or the payer may not use it (policy, tariff);
 * - `pool_empty` — the payer's `ai.authoring` credits for the period are spent.
 */
export type PhraseMarksRefusal = 'language_not_supported' | 'no_words' | 'too_long' | 'not_available' | 'pool_empty';

export type PhraseMarksOutcome =
  | { status: 'ok'; marks: PhraseMarks; aiCallIds: string[] }
  | { status: 'refused'; reason: PhraseMarksRefusal }
  /** The provider's code, `invalid_response`, `gate_unavailable` or `unavailable`. */
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

/**
 * A suggestion of phrase marks for the editor (plan 86, step 5c): the caller's words → one call
 * under the payer's `ai.authoring` (surface `authoring`) → groups, accents and links by word
 * index. Nothing is stored here; the caller turns the indices into its anchors and shows the
 * teacher a draft to fix and save.
 */
@CommandHandler(SuggestPhraseMarksCommand)
export class SuggestPhraseMarksHandler implements ICommandHandler<SuggestPhraseMarksCommand, PhraseMarksOutcome> {
  constructor(private readonly gateway: AiGateway) {}

  async execute({ request }: SuggestPhraseMarksCommand): Promise<PhraseMarksOutcome> {
    if (!PROSODY_MARKUP_LANGUAGES.has(request.language)) return refused('language_not_supported');
    if (request.spans.length === 0) return refused('no_words');
    if (request.spans.length > MAX_MARKUP_WORDS) return refused('too_long');

    const context: CallContext = {
      payer: payerOf(request),
      // The author's platform role is the caller's to know; the payer is what counts.
      actor: { userId: request.userId, role: null },
      surface: AUTHORING_SURFACE,
    };
    const input = { targetLanguage: languageName(request.language), text: request.text, spans: request.spans };
    const call = await this.gateway.call(PROSODY_MARKUP.code, context, (promptVersion) =>
      prosodyMarkupRequest(promptVersion, input),
    );
    const aiCallIds = [call.recorded.callId];
    if (call.routed.isFail) return notAnswered(call.routed.error, aiCallIds);
    const { output } = call.routed.value.result;
    if (output.kind !== 'structured') return { status: 'failed', errorCode: 'invalid_response', aiCallIds };
    return { status: 'ok', marks: readPhraseMarks(output.data, input), aiCallIds };
  }
}

/** The material's school when it has one, else the author under their own plan. */
function payerOf(request: SuggestPhraseMarksRequest): Payer {
  return request.schoolId === null ? { type: 'user', id: request.userId } : { type: 'workspace', id: request.schoolId };
}

function refused(reason: PhraseMarksRefusal): PhraseMarksOutcome {
  return { status: 'refused', reason };
}

function notAnswered<R>(failure: GatewayFailureOf<R>, aiCallIds: string[]): PhraseMarksOutcome {
  switch (failure.kind) {
    case 'disabled':
      return refused('not_available');
    case 'refused':
      return refused(failure.code === 'quota_exhausted' ? 'pool_empty' : 'not_available');
    case 'gate_unavailable':
    case 'unavailable':
      return { status: 'failed', errorCode: failure.kind, aiCallIds };
    case 'error':
      return { status: 'failed', errorCode: failure.error.code, aiCallIds };
  }
}
