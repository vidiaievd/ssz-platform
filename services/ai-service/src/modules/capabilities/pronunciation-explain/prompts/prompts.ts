import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ExplainSoundsInput } from '../domain/sound-explanations.js';
import { pronunciationExplainRequestV1 } from './pronunciation-explain.v1.js';
import { pronunciationExplainRequestV2 } from './pronunciation-explain.v2.js';

/**
 * Prompt versions of `pronunciation_explain` (and `voice_review_explain`), as an admin names them
 * on the binding. v2 (plan 86, step 9.2) adds the articulation base of content-service to the
 * inventory's notes; without a base it asks what v1 asks, in v2's words.
 */
const VERSIONS: Record<string, (input: ExplainSoundsInput) => GatewayRequest> = {
  'pronunciation_explain@1': pronunciationExplainRequestV1,
  'pronunciation_explain@2': pronunciationExplainRequestV2,
};

export const PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request under a prompt version. The binding check keeps unknown versions out. */
export function pronunciationExplainRequest(promptVersion: string, input: ExplainSoundsInput): GatewayRequest {
  const build = VERSIONS[promptVersion];
  if (!build) throw new Error(`pronunciation_explain has no prompt version "${promptVersion}"`);
  return build(input);
}
