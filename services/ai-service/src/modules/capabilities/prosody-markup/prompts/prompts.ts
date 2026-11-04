import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { PhraseMarksInput } from '../domain/phrase-marks.js';
import { prosodyMarkupRequestV1 } from './prosody-markup.v1.js';

/** Prompt versions of `prosody_markup`, as an admin names them on the binding. */
const VERSIONS: Record<string, (input: PhraseMarksInput) => GatewayRequest> = {
  'prosody_markup@1': prosodyMarkupRequestV1,
};

export const PROSODY_MARKUP_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request under a prompt version. The binding check keeps unknown versions out. */
export function prosodyMarkupRequest(promptVersion: string, input: PhraseMarksInput): GatewayRequest {
  const build = VERSIONS[promptVersion];
  if (!build) throw new Error(`prosody_markup has no prompt version "${promptVersion}"`);
  return build(input);
}
