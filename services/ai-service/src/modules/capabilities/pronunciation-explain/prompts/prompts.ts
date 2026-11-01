import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ExplainSoundsInput } from '../domain/sound-explanations.js';
import { pronunciationExplainRequestV1 } from './pronunciation-explain.v1.js';

/** Prompt versions of `pronunciation_explain`, as an admin names them on the binding. */
const VERSIONS: Record<string, (input: ExplainSoundsInput) => GatewayRequest> = {
  'pronunciation_explain@1': pronunciationExplainRequestV1,
};

export const PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request under a prompt version. The binding check keeps unknown versions out. */
export function pronunciationExplainRequest(promptVersion: string, input: ExplainSoundsInput): GatewayRequest {
  const build = VERSIONS[promptVersion];
  if (!build) throw new Error(`pronunciation_explain has no prompt version "${promptVersion}"`);
  return build(input);
}
