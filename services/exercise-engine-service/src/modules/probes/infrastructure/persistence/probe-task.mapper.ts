import type { ProbeTaskModel } from '../../../../../generated/prisma/models/ProbeTask.js';
import { ProbeTask } from '../../domain/entities/probe-task.entity.js';
import type { ProbeSource } from '../../domain/entities/probe-task.entity.js';
import type {
  AttemptItemTarget,
  DifficultyLevel,
} from '../../../attempts/domain/entities/attempt.entity.js';
import type { Focus, Modality, Skill } from '@ssz/contracts';

const MODALITIES: readonly Modality[] = ['recognition', 'recall', 'production', 'unknown'];

/**
 * The addresses, read rather than cast.
 *
 * This list is where the probe's evidence ends up, so a row holding something else must
 * read as *no address* rather than as a truthy array of `undefined` atom ids: an
 * unaddressed probe produces no evidence, which is a probe that did nothing, while a
 * malformed one would produce evidence against an atom that does not exist and quietly
 * corrupt a learner's profile.
 */
function readTargets(value: unknown): AttemptItemTarget[] {
  if (!Array.isArray(value)) return [];

  const out: AttemptItemTarget[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { itemKey, atomType, atomId, role } = raw as Record<string, unknown>;
    if (typeof atomType !== 'string' || atomType === '') continue;
    if (typeof atomId !== 'string' || atomId === '') continue;
    out.push({
      itemKey: typeof itemKey === 'string' ? itemKey : null,
      atomType,
      atomId,
      // Anything but the word `context` weighs as `focus`. The safe reading of a broken
      // role is the one the probe was made for: a probe exists to examine its subject.
      role: role === 'context' ? 'context' : 'focus',
    });
  }
  return out;
}

function readModality(value: unknown): Modality {
  return MODALITIES.includes(value as Modality) ? (value as Modality) : 'unknown';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export class ProbeTaskMapper {
  static toDomain(row: ProbeTaskModel): ProbeTask {
    return ProbeTask.restore({
      id: row.id,
      userId: row.userId,
      subject: { atomType: row.subjectAtomType, atomId: row.subjectAtomId },
      requiredModality: readModality(row.requiredModality),
      definition: {
        templateCode: row.templateCode,
        targetLanguage: row.targetLanguage,
        difficultyLevel: row.difficultyLevel as DifficultyLevel,
        content: row.content,
        expectedAnswers: row.expectedAnswers ?? null,
        answerCheckSettings: (row.answerCheckSettings as Record<string, unknown> | null) ?? null,
        instruction: (row.instruction as ProbeTask['definition']['instruction']) ?? null,
      },
      skills: readStringArray(row.skills) as Skill[],
      focus: readStringArray(row.focus) as Focus[],
      targets: readTargets(row.targets),
      source: row.source as ProbeSource,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      promotedExerciseId: row.promotedExerciseId,
      promotedAt: row.promotedAt,
    });
  }

  static toPersistence(probe: ProbeTask): ProbeTaskModel {
    return {
      id: probe.id,
      userId: probe.userId,
      subjectAtomType: probe.subject.atomType,
      subjectAtomId: probe.subject.atomId,
      requiredModality: probe.requiredModality,
      templateCode: probe.definition.templateCode,
      targetLanguage: probe.definition.targetLanguage,
      difficultyLevel: probe.definition.difficultyLevel,
      content: probe.definition.content as ProbeTaskModel['content'],
      expectedAnswers: probe.definition.expectedAnswers as ProbeTaskModel['expectedAnswers'],
      answerCheckSettings: probe.definition
        .answerCheckSettings as ProbeTaskModel['answerCheckSettings'],
      instruction: probe.definition.instruction as ProbeTaskModel['instruction'],
      skills: probe.skills,
      focus: probe.focus,
      targets: probe.targets as unknown as ProbeTaskModel['targets'],
      source: probe.source,
      createdByUserId: probe.createdByUserId,
      createdAt: probe.createdAt,
      expiresAt: probe.expiresAt,
      promotedExerciseId: probe.promotedExerciseId,
      promotedAt: probe.promotedAt,
    };
  }
}
