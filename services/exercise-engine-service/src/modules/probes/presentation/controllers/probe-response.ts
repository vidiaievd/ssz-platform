import type { ProbeTask } from '../../domain/entities/probe-task.entity.js';
import type { ProbeResponseDto } from '../dto/probe.dto.js';

/**
 * One probe, as every route here answers with it.
 *
 * Note what is *not* in it: the task document, the key and the check settings. A probe's
 * content is read exactly once, by starting an attempt on it — which is where the
 * template's own masking rules apply and where the key is taken away. Shipping the
 * document from a plain read would hand the answers to any of the templates that store
 * them inside their content, and would do it outside every rule the engine has for that.
 *
 * `secondsRemaining` is computed on the way out rather than stored. The row holds an
 * instant; what a caller needs is how long it has, and reading one off the other at the
 * far end is how two clocks end up disagreeing about a task that is nearly over.
 */
export function toProbeResponse(probe: ProbeTask): ProbeResponseDto {
  return {
    id: probe.id,
    userId: probe.userId,
    subject: probe.subject,
    requiredModality: probe.requiredModality,
    templateCode: probe.definition.templateCode,
    targetLanguage: probe.definition.targetLanguage,
    difficultyLevel: probe.definition.difficultyLevel,
    skills: probe.skills,
    focus: probe.focus,
    targets: probe.targets,
    source: probe.source,
    createdAt: probe.createdAt.toISOString(),
    expiresAt: probe.expiresAt.toISOString(),
    secondsRemaining: probe.secondsRemaining(),
    promotedExerciseId: probe.promotedExerciseId,
  };
}
