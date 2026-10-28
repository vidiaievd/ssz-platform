import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { LlmTool } from '../../../providers/domain/llm-request.js';
import type { AssistContext, AssistContextKind, AssistEvidence } from '../domain/assist-answer.js';
import { assistRequestV1 } from './student-assist.v1.js';

/** What the system prompt is built from: the same for every round of a turn. */
export interface AssistPrompt {
  targetLanguage: string;
  /** Q5: the school's explanation language for a school's course, else the learner's `uiLocale`. */
  explanationLanguage: string;
  contextKind: AssistContextKind;
}

/** One learner turn: what the phone sent (Q1 = A — the thread lives there) and the tools offered. */
export interface AssistTurn {
  context: AssistContext;
  history: readonly { role: 'user' | 'assistant'; text: string }[];
  message: string;
  tools: LlmTool[];
}

type Builder = (prompt: AssistPrompt, turn: AssistTurn, evidence: AssistEvidence) => GatewayRequest;

/**
 * Prompt versions of `student_assist`, as an admin names them on the binding. A change of
 * wording is a new version, so the feedback of one version is never read as another's.
 */
const VERSIONS: Record<string, Builder> = {
  'student_assist@1': assistRequestV1,
};

export const STUDENT_ASSIST_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/**
 * The request for one round of a turn. Rebuilt every round: the verifier checks against the
 * evidence gathered so far, and a later round may cite what an earlier round's tool returned.
 */
export function assistRequest(promptVersion: string, prompt: AssistPrompt, turn: AssistTurn, evidence: AssistEvidence): GatewayRequest {
  const build = VERSIONS[promptVersion];
  if (!build) throw new Error(`student_assist has no prompt version "${promptVersion}"`);
  return build(prompt, turn, evidence);
}
