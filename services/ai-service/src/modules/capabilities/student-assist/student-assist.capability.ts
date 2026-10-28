import type { CapabilityDefinition } from '../domain/capability.js';
import { STUDENT_ASSIST_PROMPT_VERSIONS } from './prompts/prompts.js';

/**
 * The learner's assistant (plan 83): questions about the course, answered from the course's
 * material through read-only tools, with citations the server checks. Sold as
 * `ai.student_assist`; the payer is the workspace of the course, or the learner for self-study
 * and free questions (Q3). Tools because the material is read on demand, JSON because the
 * answer's structure — citations, suggestions — is what the client acts on.
 */
export const STUDENT_ASSIST: CapabilityDefinition = {
  code: 'student_assist',
  description: 'Learner\'s assistant: answers questions about the course from its own material, with checked citations',
  requiredFeatures: { tools: true, structuredOutput: 'json_mode' },
  promptVersions: STUDENT_ASSIST_PROMPT_VERSIONS,
};
