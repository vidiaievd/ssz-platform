import { Logger } from '@nestjs/common';
import { AiGateway, type GatewayCallOf } from '../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../ledger/domain/ai-call.js';
import { readExplanations, type SoundExplanations, type SoundToExplain } from '../../pronunciation-explain/domain/sound-explanations.js';
import { PRONUNCIATION_EXPLAIN } from '../../pronunciation-explain/pronunciation-explain.capability.js';
import { pronunciationExplainRequest } from '../../pronunciation-explain/prompts/prompts.js';
import { languageName } from '../../review-draft/domain/comment-language.js';

/**
 * The weak sounds of one hearing explained by a model, all in one call (plan 88, step 5b).
 * Null explanations when it did not answer usably — off, refused, failed: the inventory's notes stay.
 */
export async function explainSounds(
  gateway: AiGateway,
  logger: Logger,
  context: CallContext,
  targetLanguage: string,
  explanationLanguage: string,
  sounds: SoundToExplain[],
): Promise<{ call: GatewayCallOf<unknown>; explanations: SoundExplanations | null }> {
  const input = { targetLanguage: languageName(targetLanguage), explanationLanguage: languageName(explanationLanguage), sounds };
  const call = await gateway.call(PRONUNCIATION_EXPLAIN.code, context, (promptVersion) => pronunciationExplainRequest(promptVersion, input));
  if (call.routed.isFail) {
    // Off is a choice (no binding yet), not a failure worth a line per try.
    if (call.routed.error.kind !== 'disabled') logger.warn(`Sounds of a sentence not explained: ${call.routed.error.kind}`);
    return { call, explanations: null };
  }
  const { output } = call.routed.value.result;
  if (output.kind !== 'structured') return { call, explanations: null };
  return { call, explanations: readExplanations(output.data, sounds.length) };
}
