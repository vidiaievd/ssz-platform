import type { ExerciseTemplateDefinition } from '../../../../shared/application/ports/content-client.port.js';
import { TEMPLATE_CODE as SOUND_SESSION } from '../../../sound-sessions/domain/sound-session-template.js';

/**
 * Templates the engine owns and content-service's catalogue does not know (plan 86, step 13.4c).
 *
 * A probe on such a template is built by the engine for one learner and never authored, so there
 * is no catalogue row to read its schemas from — and asking for one would fail every session at
 * its start. No schema either: the validator checks the content and the submission itself
 * (`OWN_SUBMISSION_SHAPE`), and the submission is the engine's own record.
 */
const ENGINE_OWNED: ReadonlyMap<string, ExerciseTemplateDefinition> = new Map([
  [
    SOUND_SESSION,
    {
      code: SOUND_SESSION,
      contentSchema: {},
      answerSchema: {},
      defaultCheckSettings: {},
      supportedLanguages: null,
      isActive: true,
    },
  ],
]);

export function engineOwnedTemplate(code: string): ExerciseTemplateDefinition | null {
  return ENGINE_OWNED.get(code) ?? null;
}
